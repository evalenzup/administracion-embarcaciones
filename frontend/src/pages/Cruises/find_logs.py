import json

with open("/Users/ernesto/.gemini/antigravity-ide/brain/cf2bbfb6-c2be-4926-bb4c-ae9dfefcc747/.system_generated/logs/transcript.jsonl") as f:
    for line in f:
        try:
            data = json.loads(line)
            # Find subagent step and see if it is a tool output of capture_browser_console_logs
            if "capture_browser_console_logs" in line and data.get("type") == "SUBAGENT_STEP_RESULT":
                print(f"=== SUBAGENT STEP RESULT ===")
                print(json.dumps(data, indent=2)[:3000])
                print("="*80)
        except Exception as e:
            pass
