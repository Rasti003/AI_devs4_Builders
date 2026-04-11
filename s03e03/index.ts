import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.join(__dirname, '../.env') });

const APIKEY = process.env.AIDEVS_KEY!;
const VERIFY_URL = 'https://hub.ag3nts.org/verify';

interface Block {
  col: number;
  top_row: number;
  bottom_row: number;
  direction: 'up' | 'down';
}

interface State {
  code: number;
  message: string;
  board?: string[][];
  player?: { col: number; row: number };
  goal?: { col: number; row: number };
  blocks?: Block[];
  reached_goal?: boolean;
}

async function send(command: string): Promise<State> {
  const res = await fetch(VERIFY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apikey: APIKEY, task: 'reactor', answer: { command } }),
  });
  const state = await res.json() as State;
  console.log(`[${command}] -> `, JSON.stringify(state));
  return state;
}

function isSafe(nextCol: number, blocks: Block[]): boolean {
  const block = blocks.find(b => b.col === nextCol);
  if (!block) return true; // no block in this column

  const playerRow = 5; // robot always moves along bottom row

  // Unsafe if block currently occupies bottom row
  if (block.bottom_row >= playerRow) return false;

  // Unsafe if block is moving down and will reach bottom row next step
  if (block.direction === 'down' && block.bottom_row + 1 >= playerRow) return false;

  return true;
}

async function main() {
  // Start game
  let state = await send('start');

  let maxSteps = 100;
  let steps = 0;

  while (!state.reached_goal && steps < maxSteps) {
    steps++;

    if (!state.blocks || !state.player) {
      console.log('Missing state data, stopping.');
      break;
    }

    const nextCol = state.player.col + 1;

    if (isSafe(nextCol, state.blocks)) {
      state = await send('right');
    } else {
      state = await send('wait');
    }

    // Print board
    if (state.board) {
      console.log(state.board.map(row => row.join('')).join('\n'));
      console.log('---');
    }
  }

  if (state.reached_goal) {
    console.log('\n✓ Goal reached!', state.message);
  } else {
    console.log('\n✗ Failed after', steps, 'steps');
  }
}

main().catch(console.error);
