import fs from "node:fs";
import path from "node:path";

/** Registro de errores en userData/logs con rotación simple (main.log → main.1.log → … main.3.log). */
export class Logger {
  private readonly file: string;
  constructor(
    readonly dir: string,
    readonly maxBytes = 1024 * 1024,
    readonly keep = 3,
  ) {
    fs.mkdirSync(dir, { recursive: true });
    this.file = path.join(dir, "main.log");
  }

  private rotate(): void {
    let size = 0;
    try {
      size = fs.statSync(this.file).size;
    } catch {
      return;
    }
    if (size < this.maxBytes) return;
    for (let i = this.keep - 1; i >= 1; i--) {
      const from = path.join(this.dir, `main.${i}.log`);
      if (fs.existsSync(from)) fs.renameSync(from, path.join(this.dir, `main.${i + 1}.log`));
    }
    fs.renameSync(this.file, path.join(this.dir, "main.1.log"));
  }

  log(level: "info" | "warn" | "error", message: string): void {
    try {
      this.rotate();
      const line = `${new Date().toISOString()} [${level}] ${message.replace(/\s+$/g, "")}\n`;
      fs.appendFileSync(this.file, line);
    } catch {
      // El registro nunca debe tumbar el juego.
    }
  }
}
