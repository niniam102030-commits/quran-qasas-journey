# -*- coding: utf-8 -*-
import os
import sys
import subprocess

base = os.path.dirname(os.path.abspath(__file__))
target_dir = os.path.join(base, "تولید محتوا")
target_script = os.path.join(target_dir, "main.py")

os.chdir(target_dir)
sys.exit(subprocess.call([sys.executable, target_script] + sys.argv[1:]))
