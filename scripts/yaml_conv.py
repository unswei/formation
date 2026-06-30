#!/usr/bin/env python3
import json
import yaml
import os

def json_to_yaml(json_str):
    data = json.loads(json_str)
    return yaml.dump(data, default_flow_style=False, sort_keys=False)

if __name__ == "__main__":
    examples_dir = os.path.join(os.path.dirname(__file__), "..", "examples")
    output_dir = os.path.join(examples_dir, "yaml")
    os.makedirs(output_dir, exist_ok=True)

    for filename in os.listdir(examples_dir):
        if not filename.endswith(".json"):
            continue

        input_path = os.path.join(examples_dir, filename)
        with open(input_path) as f:
            content = f.read()

        yaml_content = json_to_yaml(content)

        base_name = os.path.splitext(filename)[0]
        output_path = os.path.join(output_dir, f"{base_name}.yaml")

        with open(output_path, "w") as f:
            f.write(yaml_content)

        print(f"Wrote {output_path}")
