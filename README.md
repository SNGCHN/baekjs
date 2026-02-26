# baekjs

> `npm i -g baekjs`

---

## JS로 백준 풀기, 왜 이렇게 귀찮을까?

Node.js로 백준을 풀어본 사람이라면 알겁니다.

**문제 하나 풀려면 보일러플레이트부터 써야 합니다.**

```js
const readline = require('readline');
const rl = readline.createInterface({ input: process.stdin });
const lines = [];
rl.on('line', (l) => lines.push(l));
rl.on('close', () => {
  const input = lines.join('\n').trim();
  // 여기서부터가 진짜 풀이
});
```

알고리즘 문제를 풀려고 앉았는데, 입력 처리 코드를 먼저 작성하고 있습니다.
`readline`이냐 `fs.readFileSync`냐 고민하고, 매번 복붙하거나 외우고 있죠.

그리고 테스트할 때는요?

- 브라우저에서 백준 열어서 예제 입력 복사
- 터미널에서 `node solution.js` 실행하면서 직접 붙여넣기
- 출력 눈으로 비교

**문제 하나에 탭 3개 왔다갔다 하고 있습니다.**

---

## baekjs가 해결합니다

### 보일러플레이트 제거

baekjs에서는 풀이만 작성하면 됩니다. 입력 처리, 제출 코드 변환은 프레임워크가 알아서 합니다.

```js
function solution(input) {
  const [a, b] = input.split(' ').map(Number);
  console.log(a + b);
}
```

이게 전부입니다. `readline` 설정, `rl.on('close')` 콜백, `fs.readFileSync('/dev/stdin')` 같은 건 신경 쓸 필요 없습니다. `bj export`를 실행하면 백준에 바로 제출할 수 있는 코드로 자동 변환됩니다.

### 문제 선택 → 풀이 → 테스트 → 제출. 브라우저 필요 없음.

```
  ╭──────────────────────────────────────────────────────╮
  │ * BaekJS                              baekjs         │
  │   #202,740등 · 4문제 풀었음 · Silver V               │
  ╰──────────────────────────────────────────────────────╯

   문제 풀기   내 문제   종료
  ──────────────────────────────────────────────────────
```

`bj` 하나면 됩니다. 명령어를 외울 필요 없습니다.

**터미널**에서 문제 고르고, **IDE**에서 풀고, **터미널**에서 테스트 돌리고, 백준에 붙여넣으면 끝.

> **참고**: baekjs에서 직접 제출하는 기능은 없습니다.
> 예제 테스트 + 제출용 코드 생성까지 지원합니다.

---

## 설치

```bash
npm i -g baekjs
```

`bj` 또는 `baekjs`, 둘 다 사용 가능합니다.

```bash
bj        # 대시보드 실행
baekjs    # 동일
```

---

## 사용법

### 1. 대시보드에서 문제 고르기

```bash
bj
```

대시보드가 뜹니다. 백준 아이디를 연결하면 내 티어, 푼 문제 수, 클래스 진행도를 볼 수 있어요.

- **문제 풀기** — 전체 문제, 단계별로 풀어보기, 알고리즘 분류, 문제 출처 등
- **내 문제** — 내가 실패한 문제, 안 푼 문제 랜덤 등

### 2. 풀이 파일 생성

문제를 선택하면,

`problem/1000.js`가 생성됩니다. 열어서 풀이를 작성하세요.

```js
// function 스타일 (기본)
function solution(input) {
  const [a, b] = input.split(' ').map(Number);
  console.log(a + b);
}
```

```js
// global 스타일
const [a, b] = input.split(' ').map(Number);
console.log(a + b);
```

스타일은 첫 실행 때 선택할 수 있고, `baekjs.config.json`에서 변경 가능합니다.

### 3. 예제 테스트


BOJ에서 예제 입출력을 가져와 자동 비교합니다. 대시보드 안에서도 문제를 열면 **예제 테스트 실행** 메뉴로 바로 돌릴 수 있어요.

```
Case #1: PASS
Case #2: PASS
PASS 2/2
```

### 4. 제출 코드 생성

`convert/1000.js`에 제출용 코드가 생성됩니다. 복사해서 백준에 붙여넣으면 끝.

```bash
bj export 1000 --print          # 터미널에 바로 출력
bj export 1000 --out submit.js  # 경로 직접 지정
```

---

## 대시보드 단축키

| 키 | 동작 |
|---|---|
| `Tab` | 탭 이동 (문제 풀기 → 내 문제 → 종료) |
| `Enter` | 선택 |
| `Esc` / `Backspace` | 뒤로 가기 |
| `↑` `↓` | 항목 이동 |
| `n` / `p` | 다음 / 이전 페이지 |
| `q` | 종료 |

## 요구 사항

- **Node.js 18** 이상

## 참고

- BOJ 일부 페이지는 스크래핑이 제한될 수 있습니다 (403).
- 제출 결과(맞았습니다/틀렸습니다)는 확인할 수 없습니다. 예제 테스트만 지원합니다.
- solved.ac 공개 API를 사용합니다.

## 라이선스

[SNGCHN](./LICENSE)
