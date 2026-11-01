#!/usr/bin/env python3
"""Decode, encode, verify and diff Azeroth Survivors "RSE1:" save exports.

Format (see docs/FORMAT.md):
    "RSE1:" + base64( nonce[16] || ciphertext || tag[20] )
    K       = b"azeroth-survivors/save/v1/" + 9c4e27d16af013b85de2710ca936c48f
    block_i = HMAC-SHA1(K, b"ks"  + nonce + u64_le(i))   20-byte keystream blocks, XORed
    tag     = HMAC-SHA1(K, b"tag" + nonce + ciphertext)

Usage:
    python tools/rse1.py decode EXPORT [-o PLAIN]
    python tools/rse1.py encode PLAIN  [-o EXPORT] [--nonce HEX]
    python tools/rse1.py verify EXPORT...
    python tools/rse1.py diff   EXPORT_A EXPORT_B
Standard library only. "-" reads stdin / writes stdout.
"""
from __future__ import annotations

import argparse
import base64
import binascii
import difflib
import hashlib
import hmac
import os
import struct
import sys

PREFIX = "RSE1:"
KEY = b"azeroth-survivors/save/v1/" + bytes.fromhex("9c4e27d16af013b85de2710ca936c48f")
NONCE_LEN = 16
TAG_LEN = 20


class SealError(ValueError):
    pass


def _keystream_xor(nonce: bytes, data: bytes) -> bytes:
    out = bytearray(data)
    for i in range(0, len(out), 20):
        block = hmac.new(KEY, b"ks" + nonce + struct.pack("<Q", i // 20), hashlib.sha1).digest()
        for j in range(min(20, len(out) - i)):
            out[i + j] ^= block[j]
    return bytes(out)


def _tag(nonce: bytes, ct: bytes) -> bytes:
    return hmac.new(KEY, b"tag" + nonce + ct, hashlib.sha1).digest()


def unseal(text: str) -> str:
    """Verify and decrypt an export. Returns the plaintext save."""
    s = text.strip()
    if not s.startswith(PREFIX):
        raise SealError('the text does not start with "RSE1:"')
    try:
        raw = base64.b64decode("".join(s[len(PREFIX):].split()), validate=True)
    except (binascii.Error, ValueError) as e:
        raise SealError(f"invalid base64: {e}") from None
    if len(raw) < NONCE_LEN + TAG_LEN + 1:
        raise SealError("the export is too short")
    nonce, ct, tag = raw[:NONCE_LEN], raw[NONCE_LEN:-TAG_LEN], raw[-TAG_LEN:]
    if not hmac.compare_digest(_tag(nonce, ct), tag):
        raise SealError("signature mismatch: damaged export or different game version")
    try:
        return _keystream_xor(nonce, ct).decode("utf-8")
    except UnicodeDecodeError:
        raise SealError("the decrypted save is not valid UTF-8") from None


def seal(plain: str, nonce: bytes | None = None) -> str:
    """Encrypt and sign a plaintext save. The nonce is random unless given."""
    nonce = os.urandom(NONCE_LEN) if nonce is None else nonce
    if len(nonce) != NONCE_LEN:
        raise SealError("the nonce must be 16 bytes")
    ct = _keystream_xor(nonce, plain.encode("utf-8"))
    return PREFIX + base64.b64encode(nonce + ct + _tag(nonce, ct)).decode("ascii")


def _read(path: str) -> str:
    if path == "-":
        return sys.stdin.read()
    with open(path, encoding="utf-8", newline="") as f:
        return f.read()


def _write(path: str | None, text: str) -> None:
    if path in (None, "-"):
        sys.stdout.write(text)
    else:
        with open(path, "w", encoding="utf-8", newline="") as f:
            f.write(text)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    d = sub.add_parser("decode", help="verify and decrypt an export")
    d.add_argument("export")
    d.add_argument("-o", "--output")
    e = sub.add_parser("encode", help="seal a plaintext save")
    e.add_argument("plain")
    e.add_argument("-o", "--output")
    e.add_argument("--nonce", help="16-byte nonce as hex (default: random)")
    v = sub.add_parser("verify", help="check the signature of one or more exports")
    v.add_argument("exports", nargs="+")
    df = sub.add_parser("diff", help="compare the content of two exports")
    df.add_argument("a")
    df.add_argument("b")
    args = ap.parse_args(argv)

    try:
        if args.cmd == "decode":
            _write(args.output, unseal(_read(args.export)))
        elif args.cmd == "encode":
            nonce = bytes.fromhex(args.nonce) if args.nonce else None
            _write(args.output, seal(_read(args.plain), nonce))
        elif args.cmd == "verify":
            bad = 0
            for p in args.exports:
                try:
                    lines = unseal(_read(p)).count("\n")
                    print(f"ok    {p} ({lines} lines)")
                except SealError as err:
                    bad += 1
                    print(f"FAIL  {p}: {err}")
            return 1 if bad else 0
        elif args.cmd == "diff":
            a, b = unseal(_read(args.a)), unseal(_read(args.b))
            out = list(difflib.unified_diff(a.splitlines(), b.splitlines(), args.a, args.b, lineterm="", n=0))
            print("\n".join(out) if out else "identical content")
    except SealError as err:
        print(f"error: {err}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
