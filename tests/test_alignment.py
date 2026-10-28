import importlib.util
from pathlib import Path
import unittest
import sys
import numpy as np
sys.path.insert(0, str(Path(__file__).parents[1] / 'alignment'))
from ctc import forced_align, text_units, emissions, align_line

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
        for key, value in [('word', 'wrong'), ('probability', .01), ('end', .2), ('start', float('nan'))]:
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

    def test_ctc_repeated_characters_require_a_blank_and_distinct_spans(self):
        log_probs = np.log(np.array([[.9,.1], [.1,.9], [.9,.1], [.1,.9], [.9,.1]]))
        result = forced_align(log_probs, [1,1])
        self.assertEqual([(s[0],s[1]) for s in result], [(1,2),(3,4)])
        self.assertIsNone(forced_align(log_probs[:2], [1,1]))

    def test_units_preserve_original_punctuation_spaces_and_scripts(self):
        text = "「你好， 世界！」 Hello, don't stop."
        units = text_units(text)
        self.assertEqual(''.join(units), text)
        self.assertEqual(len(units), 7)
        self.assertEqual(text_units('e\u0301lan vital'), ['e\u0301lan ', 'vital'])

    def test_one_acoustic_pass_is_reused_for_many_lines(self):
        class Session:
            calls = 0
            def run(self, _, payload):
                self.calls += 1
                frames=(payload['input_values'].shape[1]-400)//320+1
                return [np.zeros((1,frames,31),dtype=np.float32)]
        class Romanizer:
            def romanize_string(self,text,**kwargs): return text
        session=Session()
        result=emissions(np.ones(40*16000,dtype=np.float32),session,lambda *_:None)
        self.assertEqual(result.shape,(1999,31))
        for _ in range(10):
            segment=align_line(result,'ab cd',Romanizer(),{'a':4,'b':5,'c':6,'d':7},None,0,30)
            self.assertEqual(''.join(w['word'] for w in segment['words']),'ab cd')
        self.assertEqual(session.calls,3)

    def test_group_cannot_move_a_line_to_another_verse(self):
        for word in self.segment['words']:
            word['start'] += 10
            word['end'] += 10
        result = worker.merge_alignment(self.lines, [(0, self.segment)], 20000)
        self.assertEqual(result['alignedLines'], 0)


if __name__ == '__main__':
    unittest.main()
