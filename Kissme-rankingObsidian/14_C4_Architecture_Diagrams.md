# C4 Architecture Diagrams

## 1) C4 Context

```mermaid
flowchart LR
    Customer[Customer\nLINE LIFF User]
    Admin[Admin/Staff\nBackoffice User]
    KM[Kiss Me Ranking System\nNode.js + Express + Static Frontend]
    PG[(PostgreSQL)]
    R2[(Cloudflare R2)]
    LINE[LINE Platform\nLIFF SDK + Profile]
    XLSX[Excel Clients]

    Customer -->|Use web pages| KM
    Admin -->|Manage reviews, claims, exports| KM
    KM -->|Read/Write| PG
    KM -->|Upload/Serve images| R2
    KM -->|Client auth bootstrap| LINE
    Admin -->|Download/Upload files| XLSX
    XLSX -->|CSV/XLSX import/export via API| KM
```

## 2) C4 Container

```mermaid
flowchart TB
    subgraph Browser[Web Browser]
      IDX[index.html + script.js]
      PROF[profile.html + profile.js]
      RANK[ranking.html + ranking.js]
      ADM[admin pages]
    end

    subgraph App[Node.js Application]
      API[Express API in server.js]
      AUTH[Auth + session token map]
      DOMAIN[Domain logic\ntransactions/ranking/lottery/rewards]
      EXPORT[Export/Import logic\nCSV/XLSX + templates]
      STORAGE[Asset storage adapter\nR2 or local uploads]
    end

    subgraph Data[Data Stores]
      DB[(PostgreSQL)]
      OBJ[(R2 or uploads/)]
    end

    IDX --> API
    PROF --> API
    RANK --> API
    ADM --> API

    API --> AUTH
    API --> DOMAIN
    API --> EXPORT
    API --> STORAGE

    DOMAIN --> DB
    EXPORT --> DB
    STORAGE --> OBJ
```

## 3) C4 Component (Backend)

```mermaid
flowchart LR
    REQ[HTTP Request] --> MW[Middleware\nhelmet/cors/rate-limit/auth]
    MW --> RH[Route Handlers\nserver.js]

    RH --> U[User/Profile Component]
    RH --> T[Transaction Review Component]
    RH --> P[Points Ledger Component]
    RH --> L[Lottery + Sold-out Component]
    RH --> R[Reward Claim Component]
    RH --> E[Export/Import Component]
    RH --> S[Storage Migration Component]

    U --> SQL[(PostgreSQL queries)]
    T --> SQL
    P --> SQL
    L --> SQL
    R --> SQL
    E --> SQL

    S --> OBJ[(R2/local files)]
```

## 4) Runtime Ownership Map

- Entry point: `server.js`
- Core data logic: SQL queries embedded in route/domain helper functions
- Frontend runtime: static pages loaded directly by browser
- Session/auth model: in-memory token map for admin sessions
- Persistent truth: PostgreSQL tables + constraints

## 5) Refactor Landing Zones

- Extract auth, reward, and points into separate modules first
- Move export/import logic to dedicated services
- Introduce shared validation utilities for API and Excel import
- Add repository/query layer to reduce SQL duplication