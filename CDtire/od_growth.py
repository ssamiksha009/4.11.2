# od_growth.py
# -------------------------------------------------------
# Reads an Abaqus ODB and writes:
#   - OD/SW undeformed & inflated
#   - Growth values
#   - Section height (X-range of solid/CGAX elements at undeformed state)
#   - 5% and 15% of section height
#   to "<odb_basename>_growth.inc"
# -------------------------------------------------------

from odbAccess import openOdb
import sys
import os

# -------------------------------------------------------
# 1) Get ODB filename and open
# -------------------------------------------------------
if len(sys.argv) > 1:
    odb_name = sys.argv[1]
else:
    odb_name = input("Enter ODB file name (with .odb extension): ").strip()

odb_path = os.path.abspath(odb_name)
if not os.path.isfile(odb_path):
    raise FileNotFoundError(f"ODB file not found: {odb_path}")

odb = openOdb(path=odb_path, readOnly=True)

# -------------------------------------------------------
# 2) Collect nodes of continuum elements
# -------------------------------------------------------
solid_nodes = set()
for inst in odb.rootAssembly.instances.values():
    name_up = inst.name.upper()
    if any(k in name_up for k in ("RIGID", "REF", "ANALYTICAL", "SURF")):
        continue
    for elem in inst.elements:
        etype = elem.type.upper()
        if etype.startswith("C3D") or etype.startswith("CPE") or etype.startswith("CGAX"):
            for nd in elem.connectivity:
                solid_nodes.add((inst.name, nd))

# -------------------------------------------------------
# 3) Undeformed values
# -------------------------------------------------------
max_x_init = -1.0e99
max_y_init = -1.0e99
min_x_solid = 1.0e99
max_x_solid = -1.0e99

for inst_name, inst in odb.rootAssembly.instances.items():
    for node in inst.nodes:
        x, y = node.coordinates[0], node.coordinates[1]
        if x > max_x_init:
            max_x_init = x
        if y > max_y_init:
            max_y_init = y
        if (inst_name, node.label) in solid_nodes:
            if x < min_x_solid:
                min_x_solid = x
            if x > max_x_solid:
                max_x_solid = x

section_height = None
five_percent = None
fifteen_percent = None
if solid_nodes and max_x_solid > -1e98 and min_x_solid < 1e98:
    section_height = max_x_solid - min_x_solid
    five_percent = 0.05 * section_height
    fifteen_percent = 0.15 * section_height  # new 15% value

# -------------------------------------------------------
# 4) Inflated values (last frame of last step)
# -------------------------------------------------------
valid_steps = [nm for nm, st in odb.steps.items() if st.frames]
if not valid_steps:
    odb.close()
    raise RuntimeError("No steps with frames found in the ODB.")

last_step = odb.steps[valid_steps[-1]]
last_frame = last_step.frames[-1]
coord_field = last_frame.fieldOutputs['COORD']

max_x_inflated = -1.0e99
max_y_inflated = -1.0e99

for val in coord_field.values:
    x, y = val.data[0], val.data[1]
    if x > max_x_inflated:
        max_x_inflated = x
    if y > max_y_inflated:
        max_y_inflated = y

odb.close()

# -------------------------------------------------------
# 5) Derived values & growth
# -------------------------------------------------------
OD_undeformed = max_x_init * 2
SW_undeformed = max_y_init * 2
OD_inflated = max_x_inflated * 2
SW_inflated = max_y_inflated * 2
OD_growth = OD_inflated - OD_undeformed
SW_growth = SW_inflated - SW_undeformed

# -------------------------------------------------------
# 6) Write to *_growth.inc
# -------------------------------------------------------
base = os.path.splitext(os.path.basename(odb_path))[0]
out_file = os.path.join(os.path.dirname(odb_path), f"{base}_growth.inc")

with open(out_file, "w") as f:
    f.write("*Parameter\n")
    f.write(f"OD_undeformed={OD_undeformed:.6f}\n")
    f.write(f"SW_undeformed={SW_undeformed:.6f}\n")
    f.write(f"OD_inflated={OD_inflated:.6f}\n")
    f.write(f"SW_inflated={SW_inflated:.6f}\n")
    f.write(f"OD_growth={OD_growth:.6f}\n")
    f.write(f"SW_growth={SW_growth:.6f}\n")
    if section_height is not None:
        f.write(f"section_height={section_height:.6f}\n")
        f.write(f"section_height_5per={five_percent:.6f}\n")
        f.write(f"section_height_15per={fifteen_percent:.6f}\n")  # new 15% entry
