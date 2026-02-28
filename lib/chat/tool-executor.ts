export interface ToolDeps {
  setCarMode: (on: boolean) => void;
  setFPMode: (on: boolean) => void;
  setCharacter: (c: { handle: string; avatarUrl?: string } | null) => void;
  runPipeline: (
    buildingName: string,
    plotIndex: number
  ) => Promise<void>;
  myPlotIndex: number | null;
  userHandle: string;
  userAvatar?: string;
  addStatusMessage: (content: string, toolName: string) => void;
}

export function executeTool(
  toolName: string,
  args: Record<string, unknown>,
  deps: ToolDeps
): string {
  switch (toolName) {
    case "drive":
    case "spawn_car": {
      deps.setCarMode(true);
      return JSON.stringify({ success: true, mode: "driving" });
    }

    case "walk": {
      deps.setCharacter({
        handle: deps.userHandle,
        avatarUrl: deps.userAvatar,
      });
      deps.setFPMode(true);
      return JSON.stringify({ success: true, mode: "walking" });
    }

    case "create_building": {
      const description = (args.description as string) || "building";
      if (deps.myPlotIndex === null) {
        return JSON.stringify({
          success: false,
          error: "No plot claimed. Click an empty plot on the map first!",
        });
      }
      // Fire and forget — pipeline runs in background
      deps.runPipeline(description, deps.myPlotIndex);
      deps.addStatusMessage(
        `Generating "${description}"...`,
        toolName
      );
      return JSON.stringify({
        success: true,
        building: description,
        message: "Building generation started!",
      });
    }

    default:
      return JSON.stringify({ error: `Unknown tool: ${toolName}` });
  }
}
