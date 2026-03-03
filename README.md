<p align="center">
  <h1 align="center">baekjs</h1>
  <p align="center">
    Node.js로 백준을 풀기 위한 프레임워크.
    <br />
    문제 탐색, 예제 테스트, 제출 코드 생성까지 터미널 하나로.
  </p>
</p>

```bash
npm i -g baekjs
```

---

## 문제에만 집중하세요.

백준 Node.js 풀이에는 `readline` 보일러플레이트가 따라옵니다.
예제 복붙, 입력 파싱, 제출 형식 맞추기 — 알고리즘과 관계없는 작업입니다.

baekjs는 그 과정을 전부 없앱니다.

```js
const solution = (input) => {
  const [a, b] = input.split(' ').map(Number);
  return a + b;
};
```

이것이 전부.

입력 주입은 프레임워크가, 제출 코드 변환은 자동으로 처리합니다.

---

## 브라우저를 닫으세요.

터미널에서 `bjs`를 실행하면 대시보드가 열립니다.
문제를 고르고, IDE에서 풀고, 테스트하고, 제출 코드를 생성합니다.
모든 흐름이 대시보드 안에서 이루어집니다.

```
  +----------------------------------------------------+
  |                                                    |
  | User: baekjs                                       |
  | Rank #202,740 | Solved 4 | Rating 32               |
  | Tier: Silver V | Class 0                           |
  |                                                    |
  +----------------------------------------------------+

   문제 풀기  · 내 문제  · 내 정보  · 종료
  ────────────────────────────────────────────────
```

---

## 기능

### 문제 탐색

**브라우저를 열지 않아도 됩니다.**
전체 문제, CLASS별, 알고리즘 태그별, 출처별로 탐색합니다.

```
  문제 풀기
  카테고리를 선택하세요.

  > 전체 문제
    문제 출처
    단계별로 풀어보기
    알고리즘 분류
    추가된 문제
    문제 순위
```

### 내 문제

**내 풀이 현황을 기준으로 필터링합니다.**
실패한 문제, 아직 안 푼 문제, 나만 푼 문제 등.

```
  내 문제

  > 내가 실패한 문제
    내가 못 푼 문제
    나만 푼 문제
    아무도 못 푼 문제
    안 푼 문제 랜덤
```

### 프로필

**solved.ac 프로필을 터미널에서 바로 확인합니다.**
티어, 클래스, 레이팅, 랭킹, 아레나 기록까지.

```
  Profile

  baekjs | Silver V | Class 0
  Rank #202,740 | Solved 4 | Rating 32

  Rating Breakdown

  By Problems    ████░░░░░░░░░░░░  120
  By Class       ██░░░░░░░░░░░░░░  40
  By Solved      ███░░░░░░░░░░░░░  60
  By Votes       █░░░░░░░░░░░░░░░  12

  Class Progress

  CLASS 01  ██████░░░░░░  6/10
  CLASS 02  ████░░░░░░░░  4/20
```

### 문제 상세

**문제를 선택하면 본문과 예제를 바로 읽을 수 있습니다.**
풀이 파일도 자동 생성됩니다.

```
  Problem Focus | 1000 A+B
  ──────────────────────────────────────────
  1000 - A+B
  Silver V | accepted 250,000 users
  Tags: math, implementation
  File: problem/1000.js

  ─────────────────────┬─────────────────────
  ▏ 문제               │ ▏ 예제 입력 1
    두 정수 A와 B를  │   │ 1 2
    입력받은 다음,   │
    A+B를 출력하는   │ ▏ 예제 출력 1
    프로그램을 작성  │   │ 3
    하시오.          │
                     │
  ▏ 입력               │
    첫째 줄에 A와    │
    B가 주어진다.    │
  ─────────────────────┴─────────────────────
  ──────────────────
  > 예제 테스트 실행 (t)
    코드 변환 [제출용] (e)
    문제 페이지 열기 (o)
    목록으로 돌아가기 (Esc)
    대시보드 종료 (q)
```

### 예제 테스트

**예제 입출력을 직접 복붙할 필요 없습니다.**
백준에서 자동으로 가져와 비교합니다.

```
  예제 테스트: 1000

  network에서 2개의 예제를 불러왔습니다.
  케이스 #1: 통과
  기대값:
  3
  실제값:
  3
  ─────────────────────────────
  케이스 #2: 통과
  기대값:
  5
  실제값:
  5

  통과 2/2
```

### 제출 코드 생성

**`readline` 보일러플레이트를 직접 작성할 필요 없습니다.**
풀이를 백준 Node.js 제출 형태로 자동 변환합니다.

---

## 시작하기

```bash
npm i baekjs
bjs
```

모든 기능을 사용하려면 [solved.ac](https://solved.ac) 계정이 필요합니다.
첫 실행 시 아이디를 연결하면, 이후에는 `bjs`만 입력하면 됩니다.

문제를 선택하면 `problem/{id}.js`가 자동 생성됩니다.
`solution` 함수 안에 풀이를 작성하세요.

```js
const solution = (input) => {
  const [a, b] = input.split(' ').map(Number);
  return a + b;
};
```

---

## solved.ac API

baekjs는 [solved.ac](https://solved.ac) 비공식 API를 사용합니다.

**Base URL** &mdash; `https://solved.ac/api/v3`

| 엔드포인트 | 용도 |
|---|---|
| `/user/show` | 유저 프로필 |
| `/user/problem_stats` | 티어별 풀이 통계 |
| `/user/class_stats` | 클래스별 진행도 |
| `/search/problem` | 문제 검색 |
| `/problem/show` | 문제 상세 |
| `/problem/class` | 클래스 정보 |
| `/tag/list` | 알고리즘 태그 목록 |
| `/search/suggestion` | 검색 자동완성 |

> API 문서: [solvedac/unofficial-documentation](https://solvedac.github.io/unofficial-documentation/)

---

## 참고

- 제출 결과(AC/WA)는 확인할 수 없습니다. 예제 테스트만 지원합니다.
- solved.ac API는 인증 없이 호출되며, 과도한 요청 시 rate limit이 적용될 수 있습니다.
- 이 프로젝트는 [solved.ac](https://solved.ac) 및 [BOJ](https://www.acmicpc.net)와 관련이 없는 개인 프로젝트입니다.
- Node.js 18 이상이 필요합니다.

## 라이선스

[SNGCHN](./LICENSE)
