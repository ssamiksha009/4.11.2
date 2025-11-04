#!/usr/bin/env python3
# -------------------------------------------------------
# deflection.py (FINAL FULL + road_pos file)
# -------------------------------------------------------
# Post-process Abaqus ODB
# - Max U3 from TREAD_TOP_SURFACE (or fallback all solid nodes)
# - Compute deformed radius, omega (rad/s)
# - Speed from parameters.inc
# - Generates include (.inc), Fortran (.f), INP (.inp) files
# - kttstep = 6
# - Output filenames: 8_freeroll_pX_lX_camX_speedKmph[_extra].ext
# - Also creates: 12_road_pos_pX_lX.inc with road_pos=<positive deformed Z>
# -------------------------------------------------------

from odbAccess import openOdb
import os, sys, re


# --------------------------
# 1) Input arguments
# --------------------------
if len(sys.argv) < 3:
    # FIXED: Try to auto-detect ODB and use default speed
    odb_folder = os.getcwd()
    odb_files = [f for f in os.listdir(odb_folder) if f.endswith('.odb')]
    
    if odb_files and len(sys.argv) == 2:
        # User provided ODB but not speed variable
        odb_name = sys.argv[1]
        speed_var = 'speed1'  # Default
        print(f"Using default speed variable: {speed_var}")
    elif odb_files:
        # No arguments, use first ODB + default speed
        odb_name = odb_files[0]
        speed_var = 'speed1'
        print(f"Auto-detected: {odb_name}, speed={speed_var}")
    else:
        print("Error: No .odb files found")
        print("Usage: abaqus python deflection.py <odb_file> <speed_var>")
        sys.exit(1)
else:
    odb_name = sys.argv[1]
    speed_var = sys.argv[2].lower()

odb_path = os.path.abspath(odb_name)
odb_folder = os.path.dirname(odb_path) or os.getcwd()
parent_folder = os.path.dirname(odb_folder)
param_file = os.path.join(parent_folder, "parameters.inc")

print(f"\n[ODB] File: {odb_name}")
print(f"[FOLDER] Path: {odb_folder}")
print(f"[SPEED] Variable: {speed_var}")

if not os.path.isfile(odb_path):
    print(f"[ERROR] ODB file not found: {odb_path}")
    sys.exit(1)
if not os.path.isfile(param_file):
    print(f"[ERROR] parameters.inc not found: {param_file}")
    sys.exit(1)
else:
    print(f"[OK] Found parameters.inc: {param_file}")

# --------------------------
# 2) Read parameters.inc
# --------------------------
params = {}
with open(param_file) as f:
    for line in f:
        line = line.strip()
        if not line or line.startswith(("*", "**", "C")) or "=" not in line:
            continue
        key, val = [x.strip() for x in line.split("=", 1)]
        try:
            params[key.lower()] = float(eval(val, {}, params))
        except Exception:
            params[key.lower()] = val

if speed_var not in params:
    print(f"Speed variable {speed_var} not found in parameters.inc")
    sys.exit(1)

kmph_to_mmps = params.get("kmph_to_mmps", 1000 * 1000.0 / 3600)
speed_expr = params[speed_var]
if isinstance(speed_expr, str):
    speed_eval = speed_expr.lower()
    for k, v in params.items():
        speed_eval = speed_eval.replace(k, str(v))
    speed_mmps = abs(eval(speed_eval))
else:
    speed_mmps = abs(speed_expr)
speed_kmph = int(round(speed_mmps / kmph_to_mmps))
print(f"Speed {speed_var} = {speed_mmps:.6f} mm/s ({speed_kmph} kmph)")

# --------------------------
# 3) Parse ODB combination
# --------------------------
base_name = os.path.splitext(os.path.basename(odb_name))[0]  # remove .odb
m = re.search(r'2_rev_(p\d+)_?(l\d+)_?([-\d]+)?(.*)', base_name.lower())
if not m:
    print("Could not parse pressure/load/camber from ODB name")
    sys.exit(1)
pressure, load, camber, extra = m.groups()
camber = camber or "0"
extra = extra.strip("_")
print(f"Combination detected → Pressure: {pressure}, Load: {load}, Camber: {camber}")

# --------------------------
# 4) Open ODB and last step/frame
# --------------------------
print("Opening ODB and extracting deflection data...")
odb = openOdb(path=odb_path)
if len(odb.steps) == 0:
    print("No steps in ODB")
    odb.close()
    sys.exit(1)

last_step_name = list(odb.steps.keys())[-1]
step = odb.steps[last_step_name]
last_frame = step.frames[-1]
disp_field = last_frame.fieldOutputs["U"]
print(f"Using last step: {last_step_name}")

# --------------------------
# 5) Collect nodes from TREAD_TOP_SURFACE
# --------------------------
surface_nodes = set()
try:
    surf = odb.rootAssembly.surfaces["TREAD_TOP_SURFACE"]
    print("Using surface: TREAD_TOP_SURFACE")
    for e in surf.elements:
        if str(type(e)).endswith("SymbolicConstant'>"):
            continue
        if str(type(e)).endswith("OdbMeshElementArray'>"):
            for ee in e:
                for n in ee.connectivity:
                    surface_nodes.add(n)
        else:
            for n in e.connectivity:
                surface_nodes.add(n)
except KeyError:
    print("Surface 'TREAD_TOP_SURFACE' not found → using all solid elements")
    for inst in odb.rootAssembly.instances.values():
        if any(k in inst.name.upper() for k in ("RIGID", "REF", "ANALYTICAL", "SURF")):
            continue
        for elem in inst.elements:
            if elem.type.upper().startswith(("C3D", "CPE", "CGAX")):
                for n in elem.connectivity:
                    surface_nodes.add(n)

if not surface_nodes:
    print("No nodes found.")
    odb.close()
    sys.exit(1)

# --------------------------
# 6) Find node with max U3
# --------------------------
max_u3 = -1e9
max_node = None
for val in disp_field.values:
    if val.nodeLabel in surface_nodes:
        u3 = abs(val.data[2])
        if u3 > max_u3:
            max_u3 = u3
            max_node = val.nodeLabel

if max_node is None:
    print("No valid node found.")
    odb.close()
    sys.exit(1)

# Node object
node_obj = None
for inst in odb.rootAssembly.instances.values():
    try:
        node_obj = inst.getNodeFromLabel(max_node)
        if node_obj:
            break
    except:
        continue

if node_obj is None:
    print("Node object not found.")
    odb.close()
    sys.exit(1)

z_coord = abs(node_obj.coordinates[2] + max_u3)  # positive deformed Z
deformed_radius = z_coord
print(f"Max U3 at Node {max_node}: {max_u3:.4f} mm")
print(f"Deformed radius: {deformed_radius:.4f} mm")

# --------------------------
# 7) Omega calculation
# --------------------------
omega = abs(speed_mmps / deformed_radius)
print(f"Omega (omegafr) = {omega:.6f} rad/s")

# --------------------------
# 8) Generate file names
# --------------------------
out_base = f"8_freeroll_{pressure}_{load}_{camber}_{speed_kmph}"
if extra:
    out_base += f"_{extra}"

# --- Include file ---
inc_file = os.path.join(odb_folder, f"{out_base}.inc")
with open(inc_file, "w") as f:
    f.write(f"C Auto-generated by deflection.py\n")
    f.write(f"      kttstep = 6\n")
    f.write(f"      omegafr      = {omega:.6f}\n")
print(f"Created {inc_file}")

# --- Road position include file (no speed in name) ---
road_file = os.path.join(odb_folder, f"12_road_pos_{pressure}_{load}.inc")
with open(road_file, "w") as rf:
    rf.write("*parameter\n")
    rf.write(f"road_pos={z_coord:.6f}\n")
print(f"Created road position file: {road_file}")

# --- Fortran template ---
template_f = os.path.join(parent_folder, "freeroll.f")
if os.path.isfile(template_f):
    f_file = os.path.join(odb_folder, f"{out_base}.f")
    with open(template_f) as tf:
        lines = tf.readlines()
    new_lines = [line.replace("0_freeroll_initial.inc", os.path.basename(inc_file)) for line in lines]
    with open(f_file, "w") as nf:
        nf.writelines(new_lines)
    print(f"Created Fortran: {f_file}")
else:
    print(f"Fortran template not found: {template_f}")

# --- INP template ---
template_inp = os.path.join(parent_folder, "freeroll.inp")
if os.path.isfile(template_inp):
    inp_file = os.path.join(odb_folder, f"{out_base}.inp")
    with open(template_inp) as tf:
        lines = tf.readlines()
    new_lines = [line.replace("<ini_vel>", f"{omega:.6f}")
                     .replace("<speed>", f"{speed_mmps:.6f}") for line in lines]
    with open(inp_file, "w") as nf:
        nf.writelines(new_lines)
    print(f"Created INP: {inp_file}")
else:
    print(f"INP template not found: {template_inp}")

# Around line 170 - FIXED: Store generated files in project root

# Get paths
odb_folder = os.path.dirname(odb_path) or os.getcwd()  # Current folder (P2_L1)
parent_folder = os.path.dirname(odb_folder)  # Project root folder

#  WRITE OUTPUT FILES TO PROJECT ROOT (not P2_L1)
output_folder = parent_folder  # Use project root for generated files

# Generate .inc file
inc_file = os.path.join(output_folder, f"{out_base}.inc")
with open(inc_file, "w") as f:
    f.write(f"*INCLUDE, INPUT={out_base}.inc\n")
print(f"Created include: {inc_file}")

# Generate .f file (Fortran)
template_f = os.path.join(parent_folder, "freeroll.f")  # Template in root
if os.path.isfile(template_f):
    f_file = os.path.join(output_folder, f"{out_base}.f")
    with open(template_f) as tf:
        lines = tf.readlines()
    new_lines = [line.replace("0_freeroll_initial.inc", os.path.basename(inc_file)) for line in lines]
    with open(f_file, "w") as nf:
        nf.writelines(new_lines)
    print(f"Created Fortran: {f_file}")

# Generate .inp file
inp_file = os.path.join(output_folder, f"{out_base}.inp")
with open(template_inp) as tf:
        lines = tf.readlines()
new_lines = [line.replace("<ini_vel>", f"{omega:.6f}")
                 .replace("<speed>", f"{speed_mmps:.6f}") for line in lines]
with open(inp_file, "w") as nf:
    nf.writelines(new_lines)
print(f"Created INP: {inp_file}")

odb.close()
print("\nAll files generated successfully.")
