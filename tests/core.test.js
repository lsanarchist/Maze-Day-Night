import test from 'node:test';
import assert from 'node:assert/strict';
import {DIRS, seededRandom, generateMaze, adjacent, neighbors, canMove, setWall, cloneMaze, serializeMaze, parseMaze, Search, Session} from '../src/core.js';

function finish(search) {
  for (let i = 0; !search.done && i <= search.maze.walls.length + 1; i++) search.step();
  assert.ok(search.done, 'Search must terminate within V+1 steps');
  return search;
}
function referenceDistance(m, start, target) {
  const distance = new Int32Array(m.walls.length).fill(-1), queue = [start]; distance[start] = 0;
  for (let p = 0; p < queue.length; p++) {
    const i = queue[p]; if (i === target) return distance[i];
    for (const next of neighbors(m, i)) if (distance[next] < 0) {distance[next] = distance[i] + 1; queue.push(next);}
  }
  return -1;
}
function assertPath(m, p, start = m.start, goal = m.goal) {
  assert.equal(p[0], start); assert.equal(p.at(-1), goal);
  assert.equal(new Set(p).size, p.length, 'A path cannot repeat a cell');
  for (let i = 1; i < p.length; i++) assert.ok(neighbors(m, p[i-1]).includes(p[i]), 'Path crosses a wall');
}
function assertStructure(m) {
  for (let i = 0; i < m.walls.length; i++) {
    for (let d = 0; d < 4; d++) {
      const n = adjacent(m, i, d);
      if (n < 0) assert.ok(m.walls[i] & DIRS[d].bit);
      else assert.equal(Boolean(m.walls[i] & DIRS[d].bit), Boolean(m.walls[n] & DIRS[d].opposite));
    }
  }
}
const open = () => generateMaze(4, 4, 'open', 1);

for (const [w,h] of [[4,4],[4,40],[40,4],[16,16],[20,20],[40,40]]) {
  test(`Perfect DFS maze ${w}x${h}: connected, symmetric, V-1 edges`, () => {
    const m = generateMaze(w,h,'seed',0); assertStructure(m);
    const edgeCount = Array.from(m.walls).reduce((sum, _, i) => sum + neighbors(m,i).length,0)/2;
    assert.equal(edgeCount,w*h-1);
    const bfs = finish(new Search(m,'bfs')); assert.ok(bfs.found); assertPath(m,bfs.path);
    const seen = new Set([0]), queue = [0];
    for (let i=0;i<queue.length;i++) for(const n of neighbors(m,queue[i])) if(!seen.has(n)){seen.add(n);queue.push(n);}
    assert.equal(seen.size,w*h);
  });
}
for (const loops of [0,.08,.4,1]) {
  test(`Deterministic seed with loops=${loops}`, () => {
    assert.deepEqual(generateMaze(16,12,'Кошице 🧭',loops),generateMaze(16,12,'Кошице 🧭',loops));
    assertStructure(generateMaze(16,12,'repeat',loops));
  });
}
test('Different seeds produce different mazes', () => assert.notDeepEqual(generateMaze(20,20,'a').walls,generateMaze(20,20,'b').walls));
test('PRNG produces reproducible values in [0,1)', () => {
  const a=seededRandom('abc'),b=seededRandom('abc');
  for(let i=0;i<1000;i++){const v=a();assert.ok(v>=0&&v<1);assert.equal(v,b());}
});
test('Loops=1 opens all interior edges but preserves exterior boundary', () => {
  const m=open();assertStructure(m);
  let edges=0;for(let i=0;i<16;i++)edges+=neighbors(m,i).length;
  assert.equal(edges/2,24);
});
for (const args of [[3,4],[4,41],[4.5,5],[NaN,4],[Infinity,4],['4',4],[4,4,'x',-1],[4,4,'x',2],[4,4,'x'.repeat(65)], [4,4,123]]) {
  test(`Reject invalid generation parameters ${JSON.stringify(args)}`,()=>assert.throws(()=>generateMaze(...args)));
}
test('setWall changes both sides and never opens boundary',()=>{
  const m=open();assert.ok(setWall(m,0,1,true));assert.equal(canMove(m,0,1),-1);assert.equal(canMove(m,1,3),-1);
  setWall(m,0,1,false);assert.equal(canMove(m,0,1),1);assert.equal(canMove(m,1,3),0);
  assert.equal(setWall(m,0,0,false),false);assertStructure(m);
});
test('Clone does not alias the wall array',()=>{const m=open(),n=cloneMaze(m);setWall(n,0,1,true);assert.notEqual(n.walls[0],m.walls[0]);});
test('Invalid neighbor input is outside the board',()=>{const m=open();for(const [i,d]of [[-1,0],[16,0],[1,8],[2.5,1]])assert.equal(adjacent(m,i,d),-1);});

for(let seed=0;seed<18;seed++){
  test(`BFS, A*, DFS vs reference on cyclic maze seed=${seed}`,()=>{
    const m=generateMaze(10+seed%7,8+seed%5,`${seed}`,seed%3===0?0:.33);
    const d=referenceDistance(m,m.start,m.goal);
    for(const algorithm of ['bfs','astar','dfs']){
      const s=finish(new Search(m,algorithm));assert.ok(s.found);assertPath(m,s.path);
      if(algorithm!=='dfs')assert.equal(s.path.length-1,d);
      assert.ok(s.expanded<=m.walls.length);assert.ok(s.frontier>=0);
      assert.equal(s.frontier,[...s.seen].filter((v,i)=>v&&!s.closed[i]).length);
    }
  });
}
for(const algorithm of ['bfs','astar','dfs']){
  test(`${algorithm} reports an isolated start as unreachable`,()=>{
    const m=open();setWall(m,0,1,true);setWall(m,0,2,true);
    const s=finish(new Search(m,algorithm));assert.equal(s.found,false);assert.deepEqual(s.path,[]);assert.equal(s.expanded,1);
    assert.equal(s.frontier,0);assert.equal(s.step().done,true);
  });
  test(`${algorithm} supports source==target, zero steps`,()=>{
    const s=finish(new Search(open(),algorithm,5,5));assert.deepEqual(s.path,[5]);assert.equal(s.expanded,1);
  });
  test(`${algorithm} can search from the player's current cell`,()=>{
    const m=open(),s=finish(new Search(m,algorithm,10,15));assertPath(m,s.path,10,15);
  });
}
test('Search rejects unknown algorithm and out-of-range endpoints',()=>{
  assert.throws(()=>new Search(open(),'unknown'));assert.throws(()=>new Search(open(),'bfs',-1));assert.throws(()=>new Search(open(),'bfs',0,99));
});
test('An A* step expands exactly one actual vertex',()=>{
  const s=new Search(generateMaze(20,20,'heap-updates',.5),'astar');
  while(!s.done){const previous=s.expanded;s.step();assert.ok(s.expanded-previous<=1);}
});

test('JSON roundtrip preserves generated and edited maps',()=>{
  const m=generateMaze(17,12,'unicode Україна',.13);m.edited=true;m.start=19;m.goal=151;
  assert.deepEqual(parseMaze(serializeMaze(m)),m);
});
test('Valid disconnected JSON is accepted, not repaired',()=>{
  const m=open();setWall(m,0,1,true);setWall(m,0,2,true);
  assert.equal(finish(new Search(parseMaze(serializeMaze(m)))).found,false);
});
const invalidMutations=[
  ['schema',m=>m.schema='other'],['version',m=>m.version=2],['width',m=>m.width=100000],
  ['array length',m=>m.walls.pop()],['wall value',m=>m.walls[0]=16],['fractional wall',m=>m.walls[0]=1.5],
  ['string wall',m=>m.walls[0]='9'],['same endpoints',m=>m.goal=m.start],['endpoint range',m=>m.goal=-1],
  ['seed length',m=>m.seed='x'.repeat(65)],['seed type',m=>m.seed={}],['loops range',m=>m.loops=2],
  ['outer boundary',m=>m.walls[0]&=~1],['wall asymmetry',m=>m.walls[0]|=2]
];
for(const [name,mutate]of invalidMutations)test(`Reject JSON: ${name}`,()=>{const m=JSON.parse(serializeMaze(open()));mutate(m);assert.throws(()=>parseMaze(JSON.stringify(m)));});
test('Reject malformed, null and oversized JSON',()=>{for(const t of ['{','null','[]','x'.repeat(100001)])assert.throws(()=>parseMaze(t));});

test('Session manual moves respect walls, boundaries and counter',()=>{
  const s=new Session(open());assert.equal(s.move(0),'wall');assert.equal(s.player,0);assert.equal(s.moves,0);
  assert.equal(s.move(1),'moved');assert.equal(s.player,1);assert.equal(s.moves,1);
  s.resetPlayer();assert.equal(s.player,0);assert.equal(s.moves,0);assert.equal(s.trail.size,1);
});
test('Session search pause, single-step and resume transitions',()=>{
  const s=new Session(open());s.beginSearch('bfs');assert.equal(s.phase,'searching');assert.equal(s.move(1),'busy');
  s.pause();assert.equal(s.phase,'search-paused');s.singleStep('bfs');assert.equal(s.expanded,1);assert.equal(s.phase,'search-paused');
  s.resume();assert.equal(s.phase,'searching');while(s.phase==='searching')s.advanceSearch();
  assert.equal(s.phase,'solved');assert.equal(s.pathLength,6);
});
test('Session autoplay can pause, single-step, resume, and reach goal',()=>{
  const s=new Session(open());s.beginSearch('astar');while(s.phase==='searching')s.advanceSearch();
  assert.ok(s.startWalking());assert.equal(s.phase,'walking');assert.equal(s.move(1),'busy');
  s.pause();assert.equal(s.phase,'walk-paused');s.singleStep();assert.equal(s.moves,1);assert.equal(s.phase,'walk-paused');
  s.resume();while(s.phase==='walking')s.advanceWalk();assert.equal(s.phase,'won');assert.equal(s.player,s.maze.goal);assert.equal(s.moves,6);
});
test('Search starts at current player position rather than original start',()=>{
  const s=new Session(open());s.move(1);s.move(2);s.beginSearch('bfs');while(s.phase==='searching')s.advanceSearch();
  assert.equal(s.path[0],5);assert.equal(s.pathLength,4);
});
test('Successful manual input invalidates stale path and paused search',()=>{
  const s=new Session(open());s.beginSearch();s.pause();s.move(1);assert.equal(s.phase,'idle');assert.equal(s.search,null);assert.equal(s.pathLength,null);
  assert.ok([...s.visual].every(v=>v===0));assert.equal(s.player,1);
});
test('Manual goal completion and reset',()=>{
  const s=new Session(open());for(const d of [1,1,1,2,2,2])s.move(d);assert.equal(s.phase,'won');
  s.resetPlayer();assert.equal(s.phase,'idle');assert.equal(s.player,0);
});
test('Clear visualization preserves player and manual counter',()=>{
  const s=new Session(open());s.move(1);s.beginSearch();s.advanceSearch();s.clearSearch();assert.equal(s.player,1);assert.equal(s.moves,1);assert.equal(s.expanded,0);
});
test('Load a new map resets all transient state',()=>{
  const s=new Session(open());s.move(1);s.beginSearch();s.advanceSearch();s.load(generateMaze(6,8,'new'));assert.equal(s.player,0);assert.equal(s.visual.length,48);assert.equal(s.phase,'idle');assert.equal(s.moves,0);
});
test('Unreachable search does not enable autoplay',()=>{
  const m=open();setWall(m,0,1,true);setWall(m,0,2,true);const s=new Session(m);s.beginSearch();s.advanceSearch();assert.equal(s.phase,'unreachable');assert.equal(s.pathLength,null);assert.equal(s.startWalking(),false);
});
test('Already at goal can produce zero-length path and complete without movement',()=>{
  const s=new Session(open());s.player=s.maze.goal;s.beginSearch();s.advanceSearch();assert.equal(s.pathLength,0);assert.equal(s.startWalking(),true);assert.equal(s.phase,'won');assert.equal(s.moves,0);
});
