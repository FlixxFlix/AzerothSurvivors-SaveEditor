import base64
import json
import os
import subprocess
import sys
import tempfile
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))
import rse1  # noqa: E402


def read(path):
    with open(os.path.join(ROOT, path), encoding="utf-8", newline="") as f:
        return f.read()


class RSE1Test(unittest.TestCase):
    def test_vectors(self):
        for v in json.loads(read("tests/vectors.json"))["vectors"]:
            with self.subTest(v["name"]):
                self.assertEqual(rse1.seal(v["plain"], bytes.fromhex(v["nonce"])), v["export"])
                self.assertEqual(rse1.unseal(v["export"]), v["plain"])

    def test_example(self):
        self.assertEqual(rse1.unseal(read("examples/example-save.txt")), read("examples/example-save.plain.txt"))

    def test_random_nonce(self):
        plain = read("examples/example-save.plain.txt")
        a, b = rse1.seal(plain), rse1.seal(plain)
        self.assertNotEqual(a, b)
        self.assertEqual(rse1.unseal(a), plain)

    def test_tamper(self):
        raw = bytearray(base64.b64decode(read("examples/example-save.txt").strip()[5:]))
        raw[30] ^= 0x01
        with self.assertRaises(rse1.SealError):
            rse1.unseal("RSE1:" + base64.b64encode(bytes(raw)).decode())
        with self.assertRaises(rse1.SealError):
            rse1.unseal("RSE2:AAAA")

    def test_cli(self):
        tool = os.path.join(ROOT, "tools", "rse1.py")
        ex = os.path.join(ROOT, "examples", "example-save.txt")
        ok = subprocess.run([sys.executable, tool, "verify", ex], capture_output=True, text=True)
        self.assertEqual(ok.returncode, 0, ok.stdout + ok.stderr)
        with tempfile.TemporaryDirectory() as d:
            plain, sealed, bad = (os.path.join(d, n) for n in ("p.txt", "s.txt", "bad.txt"))
            subprocess.run([sys.executable, tool, "decode", ex, "-o", plain], check=True)
            subprocess.run([sys.executable, tool, "encode", plain, "-o", sealed], check=True)
            same = subprocess.run([sys.executable, tool, "diff", ex, sealed], capture_output=True, text=True, check=True)
            self.assertIn("identical content", same.stdout)
            with open(bad, "w") as f:
                f.write("RSE1:" + "A" * 60)
            fail = subprocess.run([sys.executable, tool, "verify", bad], capture_output=True, text=True)
            self.assertEqual(fail.returncode, 1)


if __name__ == "__main__":
    unittest.main()
