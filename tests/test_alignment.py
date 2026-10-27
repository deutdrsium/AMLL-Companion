import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('alignment_worker', Path(__file__).parents[1] / 'alignment/worker.py')
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)


class AlignmentTests(unittest.TestCase):
    def setUp(self):
        self.lines = [{'startTime': 0, 'endTime': 5000, 'words': [{'word': 'Hello world!', 'startTime': 0, 'endTime': 5000}], 'translatedLyric': '测试翻译', 'romanLyric': ''}]
        self.segment = {'words': [{'word': 'Hello', 'start': .2, 'end': .7, 'probability': .9}, {'word': ' world!', 'start': 1.2, 'end': 2, 'probability': .8}]}

    def test_preserves_text_annotations_and_acoustic_gap(self):
        result = worker.merge_alignment(self.lines, [(0, self.segment)], 5000)
        self.assertEqual(result['alignedLines'], 1)
        self.assertEqual(''.join(w['word'] for w in result['lines'][0]['words']), 'Hello world!')
        self.assertEqual(result['lines'][0]['translatedLyric'], '测试翻译')
        self.assertEqual(result['lines'][0]['words'][1]['startTime'], 1200)
        self.assertEqual(len(self.lines[0]['words']), 1)

    def test_uncertain_or_mismatched_results_remain_line_timed(self):
        for key, value in [('word', 'wrong'), ('probability', .1), ('end', .2), ('start', float('nan'))]:
            import copy
            segment = copy.deepcopy(self.segment)
            segment['words'][0][key] = value
            result = worker.merge_alignment(self.lines, [(0, segment)], 5000)
            self.assertEqual(result['alignedLines'], 0)
            self.assertEqual(result['lines'], self.lines)

    def test_overlapping_words_remain_line_timed(self):
        self.segment['words'][1]['start'] = .5
        result = worker.merge_alignment(self.lines, [(0, self.segment)], 5000)
        self.assertEqual(result['alignedLines'], 0)
        self.assertEqual(result['lines'], self.lines)

    def test_language_detection_skips_instrumental_intro(self):
        audio = range(90 * 16000)
        lines = [{'startTime': 0, 'isBG': True, 'words': [{'word': 'intro'}]},
                 {'startTime': 45000, 'words': [{'word': 'First verse'}]}]
        excerpt = worker.language_excerpt(audio, lines)
        self.assertEqual(excerpt.start, 45 * 16000)
        self.assertEqual(len(excerpt), 30 * 16000)
        self.assertEqual(worker.language_excerpt(audio, []).start, 0)

    def test_groups_keep_context_but_stop_at_instrumental_gaps(self):
        import copy
        lines = []
        for start in [0, 5000, 10000, 20000]:
            line = copy.deepcopy(self.lines[0])
            line.update(startTime=start, endTime=start + 5000)
            lines.append(line)
        groups = list(worker.alignment_groups(lines, 25000))
        self.assertEqual([[entry[0] for entry in group] for group in groups], [[0, 1, 2], [3]])

    def test_split_preserves_real_word_times_and_rejects_cross_line_tokens(self):
        group = [(0, 0, 1000, 'Hello'), (1, 1000, 2000, 'world!')]
        result = worker.split_group(group, self.segment['words'], 10)
        self.assertEqual(result[1][1]['words'][0]['start'], 11.2)
        self.assertEqual(self.segment['words'][0]['start'], .2)
        self.assertEqual(worker.split_group(group, [{'word': 'Hello world!', 'start': 0, 'end': 2}], 0), [])

    def test_group_cannot_move_a_line_to_another_verse(self):
        for word in self.segment['words']:
            word['start'] += 10
            word['end'] += 10
        result = worker.merge_alignment(self.lines, [(0, self.segment)], 20000)
        self.assertEqual(result['alignedLines'], 0)


if __name__ == '__main__':
    unittest.main()
