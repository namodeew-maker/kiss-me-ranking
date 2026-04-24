# Diagrams: ERD And Key Flows

## 1) Core ERD

```mermaid
erDiagram
    USERS ||--o{ TRANSACTIONS : submits
    STAFFS ||--o{ TRANSACTIONS : serves
    TRANSACTIONS ||--|| RATINGS : has_secret_rating

    USERS ||--o{ LOTTERY_GUESSES : makes
    LOTTERY_GUESSES ||--o{ LOTTERY_REWARD_CLAIMS : claimed_by_parts

    USERS ||--o{ ADMIN_EXCEL_IMPORT_LOGS : triggers_as_actor
    ADMIN_USERS ||--o{ TRANSACTIONS : reviews
    ADMIN_USERS ||--o{ LOTTERY_REWARD_CLAIMS : redeems

    USERS ||--o{ POINTS : owns_global_identity

    USERS {
      int id PK
      string platform
      string platform_id
      uuid global_user_id
      string display_name
      string picture_url
      int progress_count
    }

    STAFFS {
      int id PK
      string name
      string nickname
      string avatar_url
      bool is_active
    }

    TRANSACTIONS {
      int id PK
      int user_id FK
      int staff_id FK
      string slip_image_url
      date service_date
      string status
      string round_label
      int reviewed_by
      datetime reviewed_at
      int guess_cycle
    }

    RATINGS {
      int id PK
      int transaction_id FK
      int looks_score
      int service_score
      int value_score
    }

    LOTTERY_GUESSES {
      int id PK
      int user_id FK
      string guess_number
      string round_label
      string result
      number reward_amount
    }

    LOTTERY_REWARD_CLAIMS {
      int id PK
      int lottery_guess_id FK
      int user_id FK
      string reward_type
      string claim_mode
      number amount
      int redeemed_by
      datetime redeemed_at
    }

    POINTS {
      int id PK
      uuid global_user_id FK
      string activity_type
      int points
      string source_platform
      json metadata
      datetime created_at
    }

    ADMIN_USERS {
      int id PK
      string username
      string role
      string password_hash
    }

    APP_SETTINGS {
      string key PK
      string value
      datetime updated_at
    }

    SOLD_OUT {
      int id PK
      int number
      string round_label
      datetime created_at
    }
```

## 2) Point Ledger Sequence

```mermaid
sequenceDiagram
    participant C as Customer
    participant API as Express API
    participant DB as PostgreSQL

    C->>API: Submit transaction
    API->>DB: INSERT transactions(status=pending)
    API->>DB: INSERT ratings

    Note over API,DB: Admin approves later

    API->>DB: UPDATE transactions(status=approved)
    API->>DB: INSERT points(activity=transaction_approved, +1)
    API->>DB: syncUserRoundState(...)

    C->>API: POST /api/lottery/guess
    API->>DB: Check round + user + sold_out + duplicate
    API->>DB: INSERT lottery_guesses
    API->>DB: INSERT points(activity=lottery_guess_spend, -5)
    API-->>C: remaining_points
```

## 3) Reward Claim Sequence

```mermaid
sequenceDiagram
    participant A as Admin
    participant API as Express API
    participant DB as PostgreSQL

    A->>API: POST /api/admin/rewards/claims
    API->>DB: BEGIN
    API->>DB: SELECT lottery_guesses FOR UPDATE
    API->>DB: SELECT SUM(claimed_amount)
    API->>DB: Validate remaining >= request
    API->>DB: INSERT lottery_reward_claims
    API->>DB: COMMIT
    API-->>A: updated reward snapshot
```

## 4) Round And Draw Logic Flow

```mermaid
flowchart TD
    A[Request arrives] --> B[Resolve current round label]
    B --> C{Round open?}
    C -- No --> D[Reject guess actions]
    C -- Yes --> E[Allow guess flow checks]
    E --> F[Check duplicate guess in round]
    F --> G[Check sold-out in round]
    G --> H[Insert guess and spend points]

    I[Admin draw request] --> J[Map drawDateLabel to round_label]
    J --> K[Fetch pending guesses in target round]
    K --> L[Set won/lost and reward amount]
    L --> M[Reward claims become available]
```

## 5) Notes

- Diagram นี้เป็น architecture-and-logic map จาก implementation ปัจจุบัน
- ก่อนใช้เป็นเอกสารทางการของทีม ควรเทียบกับ schema ล่าสุดในทุก environment