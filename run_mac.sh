#!/bin/bash
# Dev run on macOS
cd "$(dirname "$0")"
[ -d .venv ] || python3 -m venv .venv
source .venv/bin/activate
pip install -q pywebview
python main.py
