type SyncingUpdate = {
  message: string;
  currentItem: number;
  totalItems: number;
};

export function printProgress(progressUpdate: SyncingUpdate | string) {
  process.stdout.clearLine(0);
  if (typeof progressUpdate === "string") {
    process.stdout.write(`${progressUpdate}\r`);
    return;
  }
  const progress = progressUpdate.currentItem / progressUpdate.totalItems;
  const bar = createProgressBar(progress);
  process.stdout.write(
    `${bar} ${progressUpdate.message} (${progress * 100})%\r`
  );
}

function createProgressBar(progress: number) {
  const barLength = 20;
  const completedBlocks = Math.round(barLength * progress);
  const remainingBlocks = barLength - completedBlocks;
  const progressBar = "█".repeat(completedBlocks) + "░".repeat(remainingBlocks);
  return `[${progressBar}]`;
}
