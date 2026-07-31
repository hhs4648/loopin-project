from pathlib import Path
import re

for name in ["class-home.svg", "class-sessions.svg", "class-assignments.svg", "class-settings.svg", "class-students.svg"]:
    s = (Path(r"C:\Users\user\.cursor\loopin-project\assets") / name).read_text(encoding="utf-8")
    # svg opening
    print("==", name)
    print(s[:400].replace("\n", " ")[:350])
    for fill in ["#F7F7F8", "#F3F4F5", "#F8F8F7", "#FFFFFF", "white"]:
        print(f"  {fill}:", s.count(fill))
    # rect that covers almost full artboard
    for r in re.finditer(r"<rect[^>]{0,200}>", s[:8000]):
        g = r.group(0)
        wm = re.search(r'width="([\d.]+)"', g)
        hm = re.search(r'height="([\d.]+)"', g)
        if not wm or not hm:
            continue
        w, h = float(wm.group(1)), float(hm.group(1))
        if w > 1400 or h > 900:
            print(" ", g[:180])
