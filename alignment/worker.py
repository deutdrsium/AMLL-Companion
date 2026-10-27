"""Local audio/text alignment worker. JSON in/out; diagnostics go to stderr."""
import argparse
import copy
import json
import math
from pathlib import Path
import sys
import unicodedata


def normalized(text):
    return ''.join(unicodedata.normalize('NFKC', text).split())


def language_excerpt(audio, lines):
    """Detect language from a lyric-bearing section, rather than an instrumental intro."""
    for line in lines:
        if line.get('isBG') or not any(w.get('word', '').strip() for w in line.get('words', [])):
            continue
        start = line.get('startTime', 0)
        if not isinstance(start, (int, float)) or not math.isfinite(start):
            continue
        offset = max(0, round(start * 16))
        if offset < len(audio):
            return audio[offset:offset + 30 * 16000]
    return audio[:30 * 16000]


def alignment_groups(lines, duration_ms):
    """Keep short consecutive verses together so the model hears linguistic context."""
    group = []
    size = 0
    for i, line in enumerate(lines):
        text = ''.join(w['word'] for w in line.get('words', [])).strip()
        start = max(0, line['startTime'])
        end = min(duration_ms, line['endTime'])
        valid = not line.get('isBG') and len(line.get('words', [])) == 1 and text and 0 < end-start <= 30000
        if group and (not valid or start < group[-1][2] or start-group[-1][2] > 2000
                      or end-group[0][1] > 25000 or size+len(text) > 200):
            yield group
            group, size = [], 0
        if valid:
            group.append((i, start, end, text))
            size += len(text)
    if group:
        yield group


def split_group(group, words, offset):
    """Only restore line boundaries at real model word boundaries; never divide a token's time."""
    segments = []
    cursor = 0
    for index, _, _, text in group:
        selected, actual = [], ''
        target = normalized(text)
        while cursor < len(words) and len(actual) < len(target):
            word = dict(words[cursor])
            actual += normalized(word['word'])
            word['start'] += offset
            word['end'] += offset
            selected.append(word)
            cursor += 1
        if actual != target:
            return []
        segments.append((index, {'words': selected}))
    return segments if cursor == len(words) else []


def merge_alignment(lines, segments, duration_ms):
    """Keep uncertain lines unchanged; never synthesize equally spaced word times."""
    output = copy.deepcopy(lines)
    accepted = 0
    for index, segment in segments:
        original = lines[index]
        text = ''.join(w['word'] for w in original['words'])
        words = segment.get('words') or []
        if len(words) < 2 or normalized(''.join(w.get('word', '') for w in words)) != normalized(text):
            continue
        probabilities = [w.get('probability', 0) for w in words]
        if (any(not isinstance(p, (float, int)) or not math.isfinite(p) or not 0 <= p <= 1 for p in probabilities)
                or sum(probabilities) / len(probabilities) < .65
                or sum(p < .35 for p in probabilities) / len(probabilities) > .2):
            continue
        converted = []
        previous = -1
        cursor = 0
        for word in words:
            start, end = word.get('start'), word.get('end')
            probability = word.get('probability', 0)
            if not all(isinstance(n, (float, int)) and math.isfinite(n) for n in [start, end, probability]):
                break
            start, end = round(start * 1000), round(end * 1000)
            if end - start < 20 or start < previous or start < 0 or end > duration_ms + 100:
                break
            # Map model tokens back to exact original spelling, spaces and punctuation.
            target = normalized(word['word'])
            stop = cursor
            while stop < len(text) and len(normalized(text[cursor:stop])) < len(target):
                stop += 1
            if normalized(text[cursor:stop]) != target:
                break
            converted.append({'word': text[cursor:stop], 'startTime': start, 'endTime': end})
            cursor, previous = stop, end
        else:
            if len(converted) == len(words) and not text[cursor:].strip():
                # Group alignment must not move a verse into a neighbouring verse.
                if (converted[0]['startTime'] < original['startTime'] - 750
                        or converted[-1]['endTime'] > min(duration_ms, original['endTime']) + 750):
                    continue
                converted[-1]['word'] += text[cursor:]
                output[index]['words'] = converted
                output[index]['startTime'] = converted[0]['startTime']
                output[index]['endTime'] = converted[-1]['endTime']
                accepted += 1
    return {'lines': output, 'alignedLines': accepted, 'engine': 'stable-ts/whisper-small'}


def align(payload, model_root):
    import stable_whisper
    import torch
    import av
    import numpy as np
    torch.set_num_threads(4)
    resampler = av.AudioResampler(format='flt', layout='mono', rate=16000)
    samples = []
    with av.open(str(Path(payload['audio']).resolve(strict=True)), mode='r') as container:
        for frame in container.decode(audio=0):
            samples.extend(f.to_ndarray().reshape(-1) for f in resampler.resample(frame))
        samples.extend(f.to_ndarray().reshape(-1) for f in resampler.resample(None))
    audio = np.concatenate(samples) if samples else np.zeros(0, dtype=np.float32)
    duration_ms = round(len(audio) / 16)
    lines = payload['lines']
    requested_duration = payload.get('duration', 0)
    if requested_duration and abs(duration_ms - requested_duration) > 3000:
        raise ValueError('Audio duration does not match the recording; refusing preview or wrong version')
    model = stable_whisper.load_model('small', device='cpu', download_root=str(model_root), dq=True)
    language = payload.get('language', 'auto')
    if language == 'auto':
        import whisper
        excerpt = whisper.pad_or_trim(language_excerpt(audio, lines))
        mel = whisper.log_mel_spectrogram(excerpt, n_mels=model.dims.n_mels).to(model.device)
        _, probabilities = model.detect_language(mel)
        language = max(probabilities, key=probabilities.get)
    segments = []
    for group in alignment_groups(lines, duration_ms):
        start, end = group[0][1] / 1000, group[-1][2] / 1000
        text = ' '.join(entry[3] for entry in group)
        clip = audio[round(start * 16000):round(end * 16000)]
        result = model.align_words(clip, [{'start': 0, 'end': len(clip)/16000, 'text': text}],
            language=language, regroup=False, normalize_text=False, verbose=None)
        if not result.segments:
            continue
        words = [word for segment in result.segments for word in segment.to_dict().get('words', [])]
        segments.extend(split_group(group, words, start))
        print(json.dumps({'event': 'progress', 'line': group[-1][0] + 1, 'total': len(lines)}), file=sys.stderr, flush=True)
    return merge_alignment(lines, segments, duration_ms)


if __name__ == '__main__':
    sys.stdin.reconfigure(encoding='utf-8')
    sys.stdout.reconfigure(encoding='utf-8')
    parser = argparse.ArgumentParser()
    parser.add_argument('--models', type=Path, required=True)
    args = parser.parse_args()
    try:
        payload = json.load(sys.stdin)
        # Third-party model messages must not corrupt the JSON bridge.
        from contextlib import redirect_stdout
        with redirect_stdout(sys.stderr):
            result = align(payload, args.models)
        print(json.dumps({'ok': True, 'data': result}, ensure_ascii=False))
    except Exception as error:
        print(json.dumps({'ok': False, 'error': str(error)}, ensure_ascii=False))
        sys.exit(1)
