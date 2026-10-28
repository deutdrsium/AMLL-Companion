"""CTC Viterbi alignment and exact original-text spans, without an ASR decoder."""
import unicodedata
import numpy as np


def text_units(text):
    starts = []
    latin = False
    for i, character in enumerate(text):
        code = ord(character)
        cjk = 0x3040 <= code <= 0x30ff or 0x3400 <= code <= 0x9fff or 0xac00 <= code <= 0xd7af or 0x20000 <= code <= 0x323af
        if character.isalnum():
            if cjk or not latin:
                starts.append(i)
            latin = not cjk
        elif unicodedata.category(character).startswith('M'):
            continue
        elif character in "'’" and latin and i + 1 < len(text) and text[i+1].isalpha():
            continue
        else:
            latin = False
    if not starts:
        return []
    starts[0] = 0
    return [text[start:end] for start, end in zip(starts, starts[1:] + [len(text)])]


def forced_align(log_probs, targets, blank=0):
    """Return target spans from a monotonic CTC path, including repeated-label blanks."""
    if not targets or len(log_probs) < len(targets) or np.isnan(log_probs).any():
        return None
    labels = np.full(2*len(targets)+1, blank, dtype=np.int32)
    labels[1::2] = targets
    skip = np.zeros(len(labels), dtype=bool)
    skip[2:] = (labels[2:] != blank) & (labels[2:] != labels[:-2])
    previous = np.full(len(labels), -np.inf, dtype=np.float32)
    previous[:2] = log_probs[0, labels[:2]]
    trace = np.zeros((len(log_probs), len(labels)), dtype=np.uint8)
    for frame in range(1, len(log_probs)):
        advance = np.concatenate(([-np.inf], previous[:-1]))
        jump = np.concatenate(([-np.inf, -np.inf], previous[:-2]))
        jump[~skip] = -np.inf
        choices = np.stack((previous, advance, jump))
        trace[frame] = choices.argmax(axis=0)
        previous = choices.max(axis=0) + log_probs[frame, labels]
    state = len(labels)-1 if previous[-1] > previous[-2] else len(labels)-2
    if not np.isfinite(previous[state]):
        return None
    path = np.empty(len(log_probs), dtype=np.int32)
    for frame in range(len(log_probs)-1, -1, -1):
        path[frame] = state
        state -= int(trace[frame, state])
    result = []
    for index, token in enumerate(targets):
        frames = np.flatnonzero(path == 2*index+1)
        if not len(frames):
            return None
        result.append((int(frames[0]), int(frames[-1])+1, float(np.exp(log_probs[frames, token].mean()))))
    return result


def emissions(audio, session, progress):
    """One chunked acoustic pass; reuse the emissions for all lyric lines."""
    stride, context, chunk = 320, 16000, 15*16000
    count = max(0, (len(audio)-400)//stride+1)
    output = np.empty((count, 31), dtype=np.float32)
    for start in range(0, count, chunk//stride):
        end = min(count, start+chunk//stride)
        offset = max(0, start*stride-context)
        clip = audio[offset:min(len(audio), end*stride+context)]
        values = ((clip-clip.mean()) / np.sqrt(clip.var()+1e-7)).astype(np.float32)[None]
        logits = session.run(None, {'input_values': values})[0][0]
        local = start-offset//stride
        logits = logits[local:local+end-start]
        logits -= logits.max(axis=1, keepdims=True)
        output[start:end] = logits-np.log(np.exp(logits).sum(axis=1, keepdims=True))
        progress(end, count)
    return output


def align_line(log_probs, text, romanizer, vocabulary, language, start, end):
    units = text_units(text)
    targets, ranges = [31], []  # A zero-cost star at each edge absorbs non-lyric audio.
    for unit in units:
        # uroman renders Chinese numerals as digits; the acoustic alphabet needs their readings.
        numerals = dict(zip('零〇一二两三四五六七八九十百千万亿',
                            ['ling','ling','yi','er','liang','san','si','wu','liu','qi','ba','jiu','shi','bai','qian','wan','yi']))
        spoken = ''.join(numerals.get(c,c) for c in unit) if language in ('cmn','chi','zho') else unit
        roman = romanizer.romanize_string(spoken, lcode=language).lower()
        letters = [c for c in roman if c in "abcdefghijklmnopqrstuvwxyz'"]
        if not letters:
            return None
        first = len(targets)
        targets.extend(vocabulary[c] for c in letters)
        ranges.append((first, len(targets)))
    targets.append(31)
    window = log_probs[start:end]
    if not len(window) or len(units) < 2:
        return None
    window = np.concatenate((window, np.zeros((len(window), 1), dtype=np.float32)), axis=1)
    spans = forced_align(window, targets)
    if spans is None:
        return None
    return {'words': [{'word': unit, 'start': (start+spans[a][0])*.02,
                       'end': (start+spans[b-1][1])*.02,
                       'probability': float(np.mean([s[2] for s in spans[a:b]]))}
                      for unit, (a, b) in zip(units, ranges)]}
