import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "ensure sim running",
  { minutes: 2 },
  internal.simulation.ensureRunning.run
);

export default crons;
