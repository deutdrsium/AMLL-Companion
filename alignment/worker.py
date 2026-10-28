"""Local audio/text alignment worker. JSON in/out; diagnostics go to stderr."""
import argparse
import copy
import json
import math
from pathlib import Path
import sys
import unicodedata

# Embedded Python's isolated search path does not include the script directory.
sys.path.insert(0, str(Path(__file__).resolve().parent))


def normalized(text):
    return ''.join(unicodedata.normalize('NFKC', text).split())


def merge_alignment(lines, segments, duration_ms, min_probability=.30, weak_probability=.08):
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
                or sum(probabilities) / len(probabilities) < min_probability
                or sum(p < weak_probability for p in probabilities) / len(probabilities) > .2):
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
    return {'lines': output, 'alignedLines': accepted, 'engine': 'mms-ctc-q4'}


def align(payload, model_root):
    import av
    import numpy as np
    import onnxruntime as ort
    from uroman import Uroman
    from ctc import emissions, align_line
    resampler = av.AudioResampler(format='flt', layout='mono', rate=16000)
    samples = []
    with av.open(str(Path(payload['audio']).resolve(strict=True)), mode='r') as container:
        for frame in container.decode(audio=0):
            samples.extend(f.to_ndarray().reshape(-1) for f in resampler.resample(frame))
        samples.extend(f.to_ndarray().reshape(-1) for f in resampler.resample(None))
    audio = np.concatenate(samples) if samples else np.zeros(0, dtype=np.float32)
    duration_ms = round(len(audio) / 16)
    requested_duration = payload.get('duration', 0)
    if requested_duration and abs(duration_ms-requested_duration) > 3000:
        raise ValueError('Audio duration does not match the recording; refusing preview or wrong version')
    lines = payload['lines']
    options = ort.SessionOptions()
    options.intra_op_num_threads = 4
    options.inter_op_num_threads = 1
    options.enable_cpu_mem_arena = False
    options.enable_mem_pattern = False
    session = ort.InferenceSession(str(model_root / 'model_q4.onnx'), sess_options=options,
                                   providers=['CPUExecutionProvider'])
    def progress(frame, total):
        print(json.dumps({'event':'progress', 'stage':'acoustic', 'percent':round(frame/total*100)}),
              file=sys.stderr, flush=True)
    log_probs = emissions(audio, session, progress)
    del session
    vocabulary = json.loads((model_root / 'vocab.json').read_text(encoding='utf-8'))
    romanizer = Uroman()
    language = {'zh':'cmn', 'ja':'jpn', 'ko':'kor', 'auto':None}.get(payload.get('language'))
    segments = []
    for i, line in enumerate(lines):
        if line.get('isBG') or len(line.get('words', [])) != 1:
            continue
        text = ''.join(w['word'] for w in line['words'])
        start = max(0, round(line['startTime']/20))
        end = min(len(log_probs), round(line['endTime']/20))
        if not text.strip() or end <= start:
            continue
        segment = align_line(log_probs, text, romanizer, vocabulary, language, start, end)
        if segment:
            segments.append((i, segment))
        print(json.dumps({'event':'progress', 'line':i+1, 'total':len(lines)}), file=sys.stderr, flush=True)
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
