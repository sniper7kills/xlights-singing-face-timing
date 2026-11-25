"""Writes a minimal xLights show folder: three line models with a node range face each, and one model group."""
import shutil
import sys
from pathlib import Path

show = Path(sys.argv[1])
audio = Path(sys.argv[2])
show.mkdir(parents=True, exist_ok=True)

# Node n (1-based) of each model shows one face part, so the rendered data names the phoneme.
PARTS = ["AI", "E", "FV", "L", "MBP", "O", "U", "WQ", "etc", "rest"]
face = " ".join(f'Mouth-{p}="{i + 1}"' for i, p in enumerate(PARTS))
face_info = (
    f'<faceInfo Name="Face" Type="NodeRange" CustomColors="0" {face} '
    'Eyes-Open="11" Eyes-Closed="12" FaceOutline="13"/>'
)
models = []
for index, name in enumerate(["LeadTree", "ChorusPumpkin1", "ChorusPumpkin2"]):
    start = 1 + index * 39
    models.append(
        f'<model name="{name}" DisplayAs="Single Line" StartChannel="{start}" NumStrings="1" '
        f'NodesPerString="13" StringType="RGB Nodes" WorldPosX="{100 + index * 150}" WorldPosY="200" '
        f'WorldPosZ="0" X2="100" Y2="0" Z2="0" Layout="foreground">{face_info}</model>'
    )
group = (
    '<modelGroup name="ChorusGroup" models="ChorusPumpkin1,ChorusPumpkin2" layout="minimalGrid" '
    'GridSize="400" selected="0" LayoutGroup="Default"/>'
)
(show / "xlights_networks.xml").write_text(
    '<?xml version="1.0" encoding="UTF-8"?>\n<xrgb version="2"/>\n', encoding="utf-8"
)
(show / "xlights_rgbeffects.xml").write_text(
    '<?xml version="1.0" encoding="UTF-8"?>\n<xrgb>\n<models>\n'
    + "\n".join(models)
    + "\n</models>\n<modelGroups>\n"
    + group
    + "\n</modelGroups>\n</xrgb>\n",
    encoding="utf-8",
)
shutil.copyfile(audio, show / audio.name)
print("show written to", show)
