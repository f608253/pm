import os
import subprocess

# Run build_comprehensive_guide.py from the docs/ directory
script_dir = os.path.dirname(os.path.abspath(__file__))
print("Delegating build to build_comprehensive_guide.py...")
subprocess.run(
    ["python", os.path.join(script_dir, "build_comprehensive_guide.py")],
    check=True,
)
