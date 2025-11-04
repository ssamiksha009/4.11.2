#!/usr/bin/env python3
"""
extract_element_sets.py

Reads 0_axi_mesh_xpl.inp (same folder) and produces element_sets.inc with 3 sections:
  1) ELSET names
  2) Import surface names
  3) Full SURFACE and EMBEDDED ELEMENT definitions

Extras:
- Ignores *Surface Section and *Surface Interaction (only takes *SURFACE,)
- Deduplicates names but keeps order
- Proper post-process replacements without cascading issues:
    S1 -> S3
    S2 -> S4
    S3 -> S5
    S4 -> S6
"""

import os
import re

def parse_inp(lines):
    elsets = []
    surf_names = []
    surfaces = []
    embeds = []

    i = 0
    n = len(lines)
    while i < n:
        line = lines[i].strip()
        low = line.lower()

        # --- ELSET ---
        if low.startswith('*elset'):
            m = re.search(r'elset\s*=\s*([^,]+)', line, re.I)
            if m:
                elsets.append(m.group(1).strip())

        # --- SURFACE (only *SURFACE,) ---
        elif low.startswith('*surface,'):
            block = [lines[i]]
            j = i + 1
            while j < n and not lines[j].lstrip().startswith('*'):
                block.append(lines[j])
                parts = lines[j].split(',')
                if parts and parts[0].strip():
                    surf_names.append(parts[0].strip())
                j += 1
            surfaces.append(block)
            i = j - 1

        # --- EMBEDDED ---
        elif 'embed' in low:
            block = [lines[i]]
            j = i + 1
            while j < n and not lines[j].lstrip().startswith('*'):
                block.append(lines[j])
                j += 1
            embeds.append(block)
            i = j - 1

        i += 1

    # Deduplicate while preserving order
    def unique(seq):
        seen = set()
        result = []
        for x in seq:
            if x not in seen:
                seen.add(x)
                result.append(x)
        return result

    return unique(elsets), unique(surf_names), surfaces, embeds

def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    input_file = os.path.join(script_dir, "0_axi_mesh_xpl.inp")  # same folder
    output_file = os.path.join(script_dir, "element_sets.inc")

    if not os.path.isfile(input_file):
        print(f"Error: 0_axi_mesh_xpl.inp not found in {script_dir}")
        return

    with open(input_file, 'r', encoding='utf-8', errors='replace') as f:
        lines = f.readlines()

    elsets, surf_names, surfaces, embeds = parse_inp(lines)

    # Write output
    with open(output_file, 'w', encoding='utf-8') as out:
        # Section 1: ELSET names
        for name in elsets:
            out.write(name + "\n")
        out.write("**----------------------------------------------------------------------\n")

        # Section 2: Import surface names
        for name in surf_names:
            out.write(name + "\n")
        out.write("**----------------------------------------------------------------------\n")

        # Section 3: SURFACE and EMBEDDED blocks
        for block in surfaces:
            out.writelines(block)
            out.write("**----------------------------------------------------------------------\n")
        for block in embeds:
            out.writelines(block)
            out.write("**----------------------------------------------------------------------\n")

    # --- Post-process replacements ---
    with open(output_file, 'r', encoding='utf-8') as f:
        text = f.read()

    # Mapping for surface replacements without cascading issues
    mapping = {
        'S1': 'S3',
        'S2': 'S4',
        'S3': 'S5',
        'S4': 'S6',
    }

    def replace_surface(match):
        val = match.group(0)
        return mapping.get(val, val)

    # Replace only whole word S1, S2, S3, S4
    text = re.sub(r'\bS[1-4]\b', replace_surface, text)

    with open(output_file, 'w', encoding='utf-8') as f:
        f.write(text)

    print(f"Done. Wrote processed output to {output_file}")

if __name__ == "__main__":
    main()
