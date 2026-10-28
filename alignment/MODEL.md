# MMS CTC acoustic model

This package uses the universal romanizer software 'uroman' written by Ulf Hermjakob, USC Information Sciences Institute (2015-2020).

Model: https://huggingface.co/onnx-community/mms-300m-1130-forced-aligner-ONNX

Source model: https://huggingface.co/MahmoudAshraf/mms-300m-1130-forced-aligner

MMS research: Vineel Pratap et al., Meta AI, *Scaling Speech Technology to 1,000+ Languages* (2023).

The alignment model is derived from MMS-300M, fine-tuned for forced alignment by Mahmoud Ashraf and exported/quantized by ONNX Community. We redistribute its four-bit ONNX export without further weight changes. Exact revision and SHA-256 hashes are in model.json.

The weights are licensed **CC-BY-NC-4.0 (non-commercial)**. This restriction is separate from the application's AGPL-3.0-only code license. Attribution, license link and modification notices must be retained. Full license: licenses/MMS-CC-BY-NC-4.0.txt in the application directory; https://creativecommons.org/licenses/by-nc/4.0/ . No endorsement is implied.
