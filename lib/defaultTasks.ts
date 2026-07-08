import type { PrepStage, StudyTask } from "./types";

function id() {
  return Math.random().toString(36).slice(2, 10);
}

export function defaultTasksForStage(stage: PrepStage | null): StudyTask[] {
  if (stage === "beginning") {
    return [
      { id: id(), title: "Watch Boards & Beyond videos for today's system", resource: "Boards & Beyond", target: "2-3 videos", status: "pending" },
      { id: id(), title: "Read matching Pathoma chapter", resource: "Pathoma", target: "1 chapter", status: "pending" },
      { id: id(), title: "Do untimed UWorld block, tutor mode", resource: "UWorld", target: "1 block (40 Qs)", status: "pending" },
      { id: id(), title: "Review every question - right and wrong", resource: "UWorld", target: "full review", status: "pending" },
      { id: id(), title: "Make/update Anki cards from today's material", resource: "Anki", target: "20-30 cards", status: "pending" },
    ];
  }
  if (stage === "middle") {
    return [
      { id: id(), title: "Timed UWorld blocks", resource: "UWorld", target: "2 blocks (80 Qs)", status: "pending" },
      { id: id(), title: "Full review of both blocks", resource: "UWorld", target: "full review", status: "pending" },
      { id: id(), title: "Sketchy review for weak topics", resource: "Sketchy", target: "1-2 pathogens/drugs", status: "pending" },
      { id: id(), title: "Anki reviews (due cards)", resource: "Anki", target: "all due cards", status: "pending" },
      { id: id(), title: "Targeted review of a weak subject", resource: "Boards & Beyond", target: "30-45 min", status: "pending" },
    ];
  }
  if (stage === "end") {
    return [
      { id: id(), title: "Full-length NBME/UWSA under timed conditions (if scheduled)", resource: "NBME/UWSA", target: "as scheduled", status: "pending" },
      { id: id(), title: "Timed UWorld blocks, mixed/random", resource: "UWorld", target: "2-3 blocks", status: "pending" },
      { id: id(), title: "Review only incorrects + flagged", resource: "UWorld", target: "full review", status: "pending" },
      { id: id(), title: "Anki - due cards only, keep it light", resource: "Anki", target: "all due cards", status: "pending" },
      { id: id(), title: "Quick pass on weakest 1-2 topics", resource: "Boards & Beyond", target: "20-30 min", status: "pending" },
    ];
  }
  return [
    { id: id(), title: "Add your first study task for today", resource: "Other", target: "", status: "pending" },
  ];
}
