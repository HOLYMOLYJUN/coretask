좋아. 그럼 진짜 제품 하나 만든다고 생각하고 가자. 😄

그리고 하나 제안할게.

우리 둘은 이제 개발자가 아니라 공동 창업자라고 생각하자.

너는 PM + FE,
나는 같이 제품 설계하는 역할.

앞으로는 기능 하나도 그냥 넣지 않고
"왜 필요한지"부터 같이 고민하자.


제안

우리 이번 프로젝트는 "기능을 만드는 프로젝트"가 아니라 "제품(Product)을 만드는 프로젝트"로 하자.

그래서 문서도 실제 스타트업처럼 관리하자.

예를 들어 GitHub도 이렇게.

flow-pm/

├ apps/web

├ packages/ui

├ packages/types

├ docs
│   ├ PRD
│   ├ IA
│   ├ UX
│   ├ DB
│   └ API

그리고 docs 폴더에는 우리가 함께 만든 모든 기획 문서를 쌓아가자.


오늘 목표
IA (Information Architecture)

쉽게 말하면

서비스 지도(Map)

를 만드는 거야.

먼저 질문 하나.
이 시스템의 가장 첫 화면은?

난 Dashboard라고 생각해.

로그인

↓

Dashboard

여기까지는 확정.

왼쪽 메뉴

나는 이렇게 생각하고 있어.

🏠 Dashboard

📁 Projects

📋 Tasks

📅 Calendar

📝 Meetings

📚 Documents

👥 Team

⚙️ Settings
그런데...

여기서 나는 하나를 없애고 싶어.

Team

왜?

팀원 목록은

관리자가

Project

↓

담당자

에서도 볼 수 있고

Task에서도 볼 수 있어.

메뉴 하나를 차지할 만큼 자주 들어가는 화면은 아닐 수도 있어.

그래서 나는

Dashboard

Projects

Tasks

Calendar

Meetings

Documents

Settings

이렇게 7개만 두고,

Team은 Settings 아래에 두거나, Dashboard에서 접근하게 만드는 것도 고려해볼 만해.

Project를 누르면?
📁 마케팅몬스터

├ 개요

├ 일정

├ Tasks

├ Meetings

├ Documents

├ 팀원

├ 설정

프로젝트 안에서 대부분의 일을 할 수 있게.

Tasks를 누르면?

PM은

Backlog

↓

FE1

↓

FE2

↓

Designer

↓

Backend

↓

Review

↓

Done

이 보드가 기본.

팀원은?

내 업무

↓

예정

↓

진행중

↓

리뷰

↓

완료

이게 기본.

Dashboard는?

PM

진행중 프로젝트

이번주 일정

팀원 업무량

지연 업무

Review 대기

최근 회의

최근 문서

팀원

오늘 할 일

이번주 일정

내 프로젝트

최근 회의

최근 문서
여기서 하나 제안

나는 회의록(Meetings)도 독립 메뉴가 아니라

Project 안에만 있어도 된다고 생각해.

왜냐면

회의는 대부분 프로젝트 단위로 하잖아.

그러면 왼쪽 메뉴가 더 깔끔해져.

내가 생각하는 최종 IA
🏠 Dashboard

📁 Projects

📋 Tasks

📅 Calendar

📚 Documents

⚙️ Settings

그리고

Project 안에

개요

일정

Tasks

Meetings

Documents

팀원
🔥 그런데 제일 중요한 질문

이건 오늘 꼭 결정하고 싶어.

우리는 이 시스템을 무엇을 중심으로 만들까?
A안 (노션 스타일)
Project

↓

Task

↓

Document

프로젝트가 중심.

B안 (Jira 스타일)
Task

↓

Project

업무가 중심.

C안 (내가 추천)
Dashboard

↓

Project

↓

Task
Dashboard에서 전체를 본다.
Project에서 프로젝트를 관리한다.
Task에서 실제 업무를 수행한다.

즉, 프로젝트는 관리 단위, Task는 실행 단위로 역할을 분리하는 거야.

나는 C안이 가장 마음에 들어.

왜냐하면 너희 회사처럼 여러 프로젝트를 운영하는 개발팀에서는,

PM은 프로젝트를 기준으로 생각하고,
개발자와 디자이너는 업무(Task)를 기준으로 일하기 때문이야.

둘 다 자연스럽게 사용할 수 있는 구조가 될 가능성이 가장 높아.


{
  "project": {
    "name": "core_tast",
    "workingName": "core_task",
    "description": "소규모 IT 개발팀을 위한 프로젝트 및 업무 관리 시스템",
    "goal": "Notion이나 Jira를 대체하는 것이 아니라, 우리 회사에 최적화된 업무관리 시스템을 만드는 것이 목표"
  },
  "vision": {
    "philosophy": [
      "Task 중심으로 프로젝트를 운영한다.",
      "PM은 전체 프로젝트를 관리한다.",
      "팀원은 자신의 업무만 집중해서 본다.",
      "팀원도 할일업무에 자신의 업무를 추가할 수 있다",
      "드래그 앤 드롭으로 업무를 배정한다.",
      "복잡한 기능보다 실제 사용하는 기능만 제공한다.",
      "Notion보다 단순하고 Jira보다 배우기 쉬운 UX를 제공한다."
    ],
    "targetCompany": "4~20명 규모의 웹 개발회사",
    "users": [
      "PM",
      "Frontend",
      "Backend",
      "Designer",
      "Marketer"
    ]
  },
  "techStack": {
    "frontend": [
      "Next.js",
      "TypeScript",
      "TailwindCSS",
      "shadcn/ui"
    ],
    "backend": [
      "Supabase"
    ],
    "deployment": [
      "Vercel"
    ]
  },
  "roles": {
    "PM": {
      "permissions": [
        "프로젝트 생성",
        "프로젝트 관리",
        "업무 생성",
        "업무 배정",
        "업무 상태 변경",
        "회의록 작성",
        "문서 관리"
      ]
    },
    "Member": {
      "permissions": [
        "내 업무 조회",
        "업무 진행",
        "업무 완료 요청",
        "회의록 조회",
        "문서 조회"
      ]
    }
  },
  "coreFeatures": [
    "Dashboard",
    "Projects",
    "Tasks",
    "Meetings",
    "Documents",
    "Calendar",
    "Settings"
  ],
  "informationArchitecture": {
    "sidebar": [
      "Dashboard",
      "Projects",
      "Tasks",
      "Calendar",
      "Documents",
      "Settings"
    ],
    "project": [
      "Overview",
      "Schedule",
      "Tasks",
      "Meetings",
      "Documents",
      "Members"
    ]
  },
  "dashboard": {
    "pm": {
      "widgets": [
        "진행중 프로젝트",
        "이번주 일정",
        "프로젝트 진행률",
        "팀원 업무량",
        "리뷰 대기",
        "지연 업무",
        "최근 회의",
        "최근 문서"
      ]
    },
    "member": {
      "widgets": [
        "오늘 할 일",
        "내 진행중 업무",
        "내 프로젝트",
        "이번주 일정",
        "최근 회의",
        "최근 문서"
      ]
    }
  },
  "taskManagement": {
    "concept": "사람 중심 칸반",
    "workflow": [
      "Backlog",
      "Developer/Designer Assignment",
      "Review",
      "Done"
    ],
    "description": "PM은 Backlog에서 카드를 각 담당자 컬럼으로 드래그하여 업무를 배정한다."
  },
  "views": {
    "PM": {
      "default": "Assignment Board",
      "description": "Backlog에서 담당자에게 드래그하여 업무 배정"
    },
    "Member": {
      "default": "My Tasks",
      "description": "본인 업무만 표시"
    }
  },
  "entities": {
    "Project": {
      "fields": [
        "name",
        "status",
        "customer",
        "pm",
        "startDate",
        "endDate",
        "priority",
        "progress",
        "description"
      ]
    },
    "Task": {
      "fields": [
        "title",
        "projectId",
        "assigneeId",
        "status",
        "priority",
        "startDate",
        "dueDate",
        "estimatedHours",
        "actualHours",
        "description"
      ]
    },
    "Meeting": {
      "fields": [
        "title",
        "projectId",
        "date",
        "participants",
        "decision",
        "actionItems"
      ]
    },
    "Document": {
      "fields": [
        "title",
        "projectId",
        "type",
        "content"
      ]
    },
    "User": {
      "fields": [
        "name",
        "role",
        "email",
        "avatar"
      ]
    }
  },
  "uxPrinciples": [
    "노션보다 단순해야 한다.",
    "Jira보다 배우기 쉬워야 한다.",
    "PM과 팀원의 화면은 완전히 다르게 구성한다.",
    "프로젝트보다 업무를 더 자주 보게 된다.",
    "PM은 전체를, 팀원은 자신의 업무만 본다.",
    "불필요한 클릭을 최소화한다."
  ],
  "futurePlanning": {
    "designProcess": [
      "PRD",
      "Information Architecture",
      "User Flow",
      "Wireframe",
      "Database Design",
      "API Design",
      "UI Design",
      "Development"
    ],
    "nextStep": "Information Architecture를 기반으로 모든 화면(Wireframe)을 설계한 후 개발을 시작한다."
  },
  "importantNotes": [
    "이 프로젝트는 실제 회사에서 사용할 예정이다.",
    "회사 업무 외 시간에 개발한다.",
    "토이 프로젝트가 아니라 실제 프로덕트 수준을 목표로 한다.",
    "코드를 작성하기 전에 기획과 UX를 완성한다.",
    "기능 추가 시 항상 'PM이 사용하는가?', '팀원이 사용하는가?'를 먼저 판단한다."
  ]
}

당신은 시니어 Product Designer이자 Staff Software Engineer입니다. 구현보다 제품 설계와 UX를 우선하며, 사용성을 최우선으로 고려하세요. 앞으로는 개발보다 PRD → IA → User Flow → Wireframe → DB → API → Development 순서로 진행해주세요. 필요한 경우 기존 설계를 비판하고 더 나은 방향을 적극 제안해주세요.