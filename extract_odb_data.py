#!/usr/bin/env abaqus python
"""
ABAQUS .odb History Output Extractor and CSV Combiner with Multi-Step Support
"""

from odbAccess import openOdb
import csv
import os
from pathlib import Path
import sys

# === Config ===
ODB_FILE = sys.argv[1]
P_L_DIR = Path(sys.argv[2])
OUTPUT_DIR = P_L_DIR / "temp"
INSTANCE_NAME = 'PART-1-1'
LOWER_SET = 'LOWER_RIM_REFERENCE_POINT'
UPPER_SET = 'UPPER_RIM_REFERENCE_POINT'
ROAD_SET = 'ROAD_REFERENCE_POINT'
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# === Helper Functions ===
def discover_node_sets(odb):
    """Discover all available node sets in the ODB"""
    available_sets = set()
    for inst_name, instance in odb.rootAssembly.instances.items():
        for node_set_name in instance.nodeSets.keys():
            available_sets.add(node_set_name)
            print(f"Found node set: {node_set_name}")
    return available_sets

def extract_force_data_from_odb(odb, step_name, set_name, label):
    """Extract force/moment data (RF1, RF2, RF3, RM1, RM2, RM3)"""
    try:
        node_set = odb.rootAssembly.instances[INSTANCE_NAME].nodeSets[set_name]
        hist_point = node_set.nodes[0]
        region = odb.steps[step_name].getHistoryRegion(point=hist_point)
        
        extracted = {}
        for key in ['RF1', 'RF2', 'RF3', 'RM1', 'RM2', 'RM3']:
            if key in region.historyOutputs:
                data = region.historyOutputs[key].data
                extracted[f"{step_name}_{label}_{key}"] = data
            else:
                print(f"[WARN] {key} not available for {label} in step {step_name}")
        
        print(f"[OK] Extracted force/moment data from {label} ({set_name}) for step {step_name}")
        return extracted
    except KeyError:
        print(f"[WARN] Node set '{set_name}' not found in step {step_name}, skipping {label}")
        return {}

def extract_displacement_data_from_odb(odb, step_name, set_name, label):
    """Extract displacement data (U1, U2, U3)"""
    try:
        node_set = odb.rootAssembly.instances[INSTANCE_NAME].nodeSets[set_name]
        hist_point = node_set.nodes[0]
        region = odb.steps[step_name].getHistoryRegion(point=hist_point)
        
        extracted = {}
        for key in ['U1', 'U2', 'U3']:
            if key in region.historyOutputs:
                data = region.historyOutputs[key].data
                extracted[f"{step_name}_{label}_{key}"] = data
            else:
                print(f"[WARN] {key} not available for {label} in step {step_name}")
        
        print(f"[OK] Extracted displacement data from {label} ({set_name}) for step {step_name}")
        return extracted
    except KeyError:
        print(f"[WARN] Node set '{set_name}' not found in step {step_name}, skipping {label}")
        return {}

def write_csv(path, data, headers=["Time", "Value"]):
    with open(path, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(headers)
        writer.writerows(data)
    print(f"Saved: {path.name} ({len(data)} rows)")

def combine_data(lower, upper):
    return [(t1, v1 + v2) for (t1, v1), (_, v2) in zip(lower, upper)]

def combine_across_steps(step_data_list):
    """Combine data from multiple steps by merging same time points and keeping unique ones"""
    if not step_data_list:
        return []
    
    # Dictionary to store time -> value mapping
    time_value_map = {}
    
    # Process each step's data
    for step_data in step_data_list:
        if not step_data:
            continue
        
        for time, value in step_data:
            if time in time_value_map:
                # Same time exists, add the values
                time_value_map[time] += value
            else:
                # New time point, store the value
                time_value_map[time] = value
    
    # Convert back to list of tuples and sort by time
    combined = [(time, value) for time, value in sorted(time_value_map.items())]
    
    return combined

# === Main ===
def main():
    print("Opening ODB...")
    odb = openOdb(ODB_FILE)
    
    # Discover available node sets
    print("\n=== Discovering Node Sets ===")
    available_sets = discover_node_sets(odb)
    
    # Check which sets are available
    has_upper = UPPER_SET in available_sets
    has_lower = LOWER_SET in available_sets
    has_road = ROAD_SET in available_sets
    
    print(f"\nAvailable sets:")
    print(f"  - {UPPER_SET}: {'YES' if has_upper else 'NO'}")
    print(f"  - {LOWER_SET}: {'YES' if has_lower else 'NO'}")
    print(f"  - {ROAD_SET}: {'YES' if has_road else 'NO'}")
    
    if not (has_upper or has_lower or has_road):
        print(f"[ERROR] None of the required node sets found. Exiting.")
        odb.close()
        return
    
    # Get all step names
    step_names = odb.steps.keys()
    print(f"\nFound {len(step_names)} steps: {list(step_names)}")
    
    all_step_data = {}
    displacement_step_data = {}
    temp_files = []
    
    # Process each step
    for step_name in step_names:
        print(f"\n=== Processing Step: {step_name} ===")
        
        # Extract force/moment data from UPPER and LOWER if available
        lower_data = {}
        upper_data = {}
        
        if has_lower:
            print(f"Extracting force/moment data from LOWER for {step_name}...")
            lower_data = extract_force_data_from_odb(odb, step_name, LOWER_SET, 'LOWER')
        
        if has_upper:
            print(f"Extracting force/moment data from UPPER for {step_name}...")
            upper_data = extract_force_data_from_odb(odb, step_name, UPPER_SET, 'UPPER')
        
        # Extract displacement data from ROAD if available
        road_data = {}
        if has_road:
            print(f"Extracting displacement data from ROAD for {step_name}...")
            road_data = extract_displacement_data_from_odb(odb, step_name, ROAD_SET, 'ROAD')
        
        # Save temp individual CSVs for this step
        print(f"\nSaving individual CSVs for {step_name}...")
        
        # Save force/moment data
        source_data = {**lower_data, **upper_data}
        for key, data in source_data.items():
            path = OUTPUT_DIR / f"{key}.csv"
            write_csv(path, data)
            temp_files.append(path)
        
        # Save displacement data
        for key, data in road_data.items():
            path = OUTPUT_DIR / f"{key}.csv"
            write_csv(path, data)
            temp_files.append(path)
        
        # Store force/moment data for cross-step combination
        if has_upper and has_lower:
            # Both UPPER and LOWER available - combine them
            mapping = {
                'RF1': 'FX',
                'RF2': 'FYW',
                'RF3': 'FZW',
                'RM1': 'MXW',
                'RM2': 'MYW',
                'RM3': 'MZW',
            }
            
            for comp, out_name in mapping.items():
                lower = lower_data.get(f'{step_name}_LOWER_{comp}', [])
                upper = upper_data.get(f'{step_name}_UPPER_{comp}', [])
                if lower and upper:
                    step_data = combine_data(lower, upper)
                    if out_name not in all_step_data:
                        all_step_data[out_name] = []
                    all_step_data[out_name].append(step_data)
                else:
                    print(f"[WARN] Skipping {out_name} for {step_name} due to missing LOWER/UPPER data.")
        
        elif has_upper or has_lower:
            # Only one available - use it directly
            single_data = upper_data if has_upper else lower_data
            label = 'UPPER' if has_upper else 'LOWER'
            
            mapping = {
                'RF1': 'FX',
                'RF2': 'FYW',
                'RF3': 'FZW',
                'RM1': 'MXW',
                'RM2': 'MYW',
                'RM3': 'MZW',
            }
            
            for comp, out_name in mapping.items():
                step_data = single_data.get(f'{step_name}_{label}_{comp}', [])
                if step_data:
                    if out_name not in all_step_data:
                        all_step_data[out_name] = []
                    all_step_data[out_name].append(step_data)
        
        # Store displacement data for cross-step combination
        if has_road:
            for comp in ['U1', 'U2', 'U3']:
                step_data = road_data.get(f'{step_name}_ROAD_{comp}', [])
                if step_data:
                    if comp not in displacement_step_data:
                        displacement_step_data[comp] = []
                    displacement_step_data[comp].append(step_data)
    
    # Combine force/moment data across all steps and save final CSVs
    print("\n=== Combining force/moment data across all steps ===")
    for out_name, step_data_list in all_step_data.items():
        if step_data_list:
            combined_data = combine_across_steps(step_data_list)
            if combined_data:
                final_path = OUTPUT_DIR / f"{out_name}.csv"
                write_csv(final_path, combined_data)
            else:
                print(f"[WARN] No combined force/moment data for {out_name}")
        else:
            print(f"[WARN] No step data found for {out_name}")
    
    # Combine displacement data across all steps and save final CSVs
    print("\n=== Combining displacement data across all steps ===")
    for comp, step_data_list in displacement_step_data.items():
        if step_data_list:
            combined_data = combine_across_steps(step_data_list)
            if combined_data:
                final_path = OUTPUT_DIR / f"{comp}.csv"
                write_csv(final_path, combined_data)
            else:
                print(f"[WARN] No combined displacement data for {comp}")
        else:
            print(f"[WARN] No step data found for displacement {comp}")
    
    # Cleanup
    print("\nDeleting temporary files...")
    for f in temp_files:
        try:
            f.unlink()
            print(f"Deleted: {f.name}")
        except Exception as e:
            print(f"Error deleting {f.name}: {e}")
    
    odb.close()
    print(f"\n[OK] Done! Combined CSVs from {len(step_names)} steps are in 'temp/'")

if __name__ == "__main__":
    main()
