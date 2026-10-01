// 로컬 탐색용 안내 초안. 서버의 검수 완료 카탈로그와 구분한다.
const CATALOG = {
  bodyParts: [
    { id: 'chest', name: '가슴' }, { id: 'back', name: '등' },
    { id: 'legs', name: '하체' }, { id: 'glutes', name: '엉덩이' },
    { id: 'shoulders', name: '어깨' }, { id: 'arms', name: '팔' },
    { id: 'core', name: '복부' }
  ],
  equipment: [
    {
      id: 'eq_chest_press', name: '체스트 프레스 머신',
      aliases: ['체스트 프레스', '체스트프레스', 'chest press', 'seated chest press'],
      description: '앉은 자세에서 손잡이를 앞으로 밀며 가슴 운동을 하는 머신입니다.',
      image: null
    },
    {
      id: 'eq_lat_pulldown', name: '랫 풀다운 머신',
      aliases: ['랫 풀다운', '랫풀다운', 'lat pulldown', 'lat pull-down', 'seated lat pulldown'],
      description: '앉아서 머리 위의 바를 가슴 방향으로 당기는 등 운동용 머신입니다.',
      image: null
    },
    {
      id: 'eq_leg_press', name: '레그 프레스 머신',
      aliases: ['레그 프레스', '레그프레스', 'leg press', 'seated leg press'],
      description: '앉은 자세에서 발로 발판을 밀어 하체와 엉덩이를 운동하는 머신입니다.',
      image: null
    },
    {
      id: 'eq_leg_extension', name: '레그 익스텐션 머신',
      aliases: ['레그 익스텐션', '레그익스텐션', 'leg extension', 'seated leg extension'],
      description: '앉아서 무릎을 펴며 허벅지 앞쪽을 운동하는 머신입니다.',
      image: null
    },
    {
      id: 'eq_shoulder_press', name: '숄더 프레스 머신',
      aliases: ['숄더 프레스', '숄더프레스', 'shoulder press', 'close-grip shoulder press'],
      description: '등받이에 기대어 손잡이를 위로 미는 머신입니다. 여기서는 몸에 가까운 손잡이를 쓰는 좁은 그립 운동을 안내합니다.',
      image: null
    },
    {
      id: 'eq_seated_high_row', name: '시티드 하이 로우 머신',
      aliases: ['시티드 로우', '시티드로우', '하이 로우', 'seated row', 'seated high back row'],
      description: '가슴 패드에 몸을 지지하고 어깨 높이의 손잡이를 당기는 머신입니다. 여기서는 하이 로우 형태를 안내합니다.',
      image: null
    }
  ],
  exercises: [
    {
      id: 'ex_chest_press', name: '앉아서 체스트 프레스', primaryBodyPartId: 'chest',
      sourceBodyPartIds: ['chest'], secondaryBodyPartIds: null,
      equipmentIds: ['eq_chest_press'], difficulty: 'beginner', review: null,
      summary: '손잡이를 앞으로 밀며 가슴 운동을 알아보세요.',
      instructions: [
        '등을 등받이에 지지하고, 손잡이가 가슴 중간 높이에 오도록 좌석을 조절합니다. 발을 바닥이나 발 받침에 안정적으로 둡니다.',
        '손잡이를 감싸 쥐고 손목을 팔뚝과 나란히 유지합니다. 어깨를 뒤로, 아래로 두고 몸통을 안정시킵니다.',
        '숨을 내쉬며 손잡이를 천천히 앞으로 밉니다. 팔꿈치를 펴되 잠그지 않고, 어깨가 등받이에서 떨어지지 않도록 합니다.',
        '잠시 멈춘 뒤 팔꿈치를 천천히 굽혀 시작 위치로 돌아옵니다.'
      ],
      cautions: ['허리를 과도하게 젖히거나 어깨를 앞으로 말지 않습니다.', '손목이 꺾이지 않도록 유지합니다.'],
      sources: [{ title: 'ACE · Seated Chest Press', url: 'https://www.acefitness.org/resources/everyone/exercise-library/188/seated-chest-press/', checkedAt: '2026-09-30' }]
    },
    {
      id: 'ex_lat_pulldown', name: '앉아서 랫 풀다운', primaryBodyPartId: 'back',
      sourceBodyPartIds: ['back'], secondaryBodyPartIds: null,
      equipmentIds: ['eq_lat_pulldown'], difficulty: 'beginner', review: null,
      summary: '위에서 바를 당기는 등 운동을 알아보세요.',
      instructions: [
        '허벅지 패드를 허벅지 위에 맞추고 앉습니다. 몸통을 안정시키고 머리와 척추를 나란히 유지합니다.',
        '바를 양손으로 쥐고 어깨를 뒤로, 아래로 둡니다. 몸통은 약간 뒤로 기울이되 당기는 동안 더 젖히지 않습니다.',
        '숨을 내쉬면서 팔꿈치를 아래로 내리는 느낌으로 바를 가슴 위쪽 또는 중간 방향으로 당깁니다.',
        '팔꿈치가 더 내려가지 않고 뒤로 움직이기 시작하면 더 당기지 않습니다. 잠시 멈춘 뒤 바를 천천히 올려 시작 위치로 돌아옵니다.'
      ],
      cautions: ['당기는 동안 허리를 과도하게 젖히지 않습니다.', '팔꿈치가 뒤로 움직이기 시작한 뒤 무리하게 더 당기지 않습니다.'],
      sources: [{ title: 'ACE · Seated Lat Pulldown', url: 'https://www.acefitness.org/resources/everyone/exercise-library/158/seated-lat-pulldown/', checkedAt: '2026-09-30' }]
    },
    {
      id: 'ex_leg_press', name: '앉아서 레그 프레스', primaryBodyPartId: 'legs',
      sourceBodyPartIds: ['legs', 'glutes'], secondaryBodyPartIds: null,
      equipmentIds: ['eq_leg_press'], difficulty: 'beginner', review: null,
      summary: '발판을 밀며 하체와 엉덩이 운동을 알아보세요.',
      instructions: [
        '등과 엉덩이를 등받이에 지지하고 발을 발판에 둡니다. 발뒤꿈치를 붙이고 무릎이 약 90도로 굽혀지도록 좌석과 발 위치를 조절합니다.',
        '손잡이를 가볍게 잡고 몸통을 안정시킵니다. 숨을 내쉬며 발판을 천천히 밉니다.',
        '발뒤꿈치를 발판에 붙인 채 다리를 펴되 무릎을 잠그지 않습니다. 엉덩이를 좌석에서 들지 않습니다.',
        '잠시 멈춘 뒤 무릎과 엉덩이를 천천히 굽혀 돌아옵니다. 허벅지가 가슴 쪽을 과도하게 누르지 않도록 합니다.'
      ],
      cautions: ['무릎을 과도하게 펴서 잠그지 않습니다.', '발뒤꿈치를 발판에서 떼거나 허리를 둥글게 말지 않습니다.'],
      sources: [{ title: 'ACE · Seated Leg Press', url: 'https://www.acefitness.org/resources/everyone/exercise-library/154/seated-leg-press/', checkedAt: '2026-09-30' }]
    },
    {
      id: 'ex_leg_extension', name: '앉아서 레그 익스텐션', primaryBodyPartId: 'legs',
      sourceBodyPartIds: ['legs'], secondaryBodyPartIds: null,
      equipmentIds: ['eq_leg_extension'], difficulty: 'beginner', review: null,
      summary: '무릎을 펴며 허벅지 앞쪽 운동을 알아보세요.',
      instructions: [
        '등을 등받이에 붙이고 무릎이 약 90도로 굽혀지도록 조절합니다. 패드는 발목 위쪽 앞에 놓고 발끝을 앞으로 향합니다.',
        '좌석 양옆의 손잡이를 잡아 자세를 지지합니다.',
        '허벅지 앞쪽에 힘을 주어 다리를 천천히 펴되 무릎을 과도하게 젖히지 않습니다.',
        '잠시 멈춘 뒤 다리를 천천히 내려 시작 위치로 돌아옵니다.'
      ],
      cautions: ['반동을 써서 패드를 올리지 않습니다.', '다리를 부드럽게 펴고 내릴 수 있는 무게를 사용합니다.'],
      sources: [
        { title: 'ACE · Seated Leg Extension (대상 부위·난이도)', url: 'https://www.acefitness.org/resources/everyone/exercise-library/183/seated-leg-extension/', checkedAt: '2026-10-01' },
        { title: 'PureGym · Leg Extensions (사용 순서·주의점)', url: 'https://www.puregym.com/exercises/legs/quad-exercises/leg-extensions/', checkedAt: '2026-10-01' }
      ]
    },
    {
      id: 'ex_shoulder_press', name: '앉아서 좁은 그립 숄더 프레스', primaryBodyPartId: 'shoulders',
      sourceBodyPartIds: ['arms', 'shoulders'], secondaryBodyPartIds: null,
      equipmentIds: ['eq_shoulder_press'], difficulty: 'beginner', review: null,
      summary: '몸에 가까운 손잡이를 위로 밀며 어깨와 팔 운동을 알아보세요.',
      instructions: [
        '등을 등받이에 지지하고 손잡이가 어깨 높이 또는 약간 위에 오도록 좌석을 조절합니다. 발은 바닥이나 발 받침에 둡니다.',
        '몸에 가까운 손잡이를 감싸 쥐고 손목을 팔뚝과 나란히 유지합니다. 팔꿈치를 몸 앞쪽으로 향하게 하고 몸통을 안정시킵니다.',
        '숨을 내쉬며 손잡이를 천천히 위로 밉니다. 팔꿈치를 펴되 잠그지 않습니다.',
        '잠시 멈춘 뒤 손잡이를 천천히 내려 팔꿈치가 앞쪽을 향하는 시작 자세로 돌아옵니다.'
      ],
      cautions: ['허리를 과도하게 젖히지 않습니다.', '손잡이를 아래로 떨어뜨리지 말고 움직임을 제어합니다.'],
      sources: [{ title: 'ACE · Seated Machine Close-Grip Shoulder Press', url: 'https://www.acefitness.org/resources/everyone/exercise-library/187/seated-machine-close-grip-shoulder-press/', checkedAt: '2026-10-01' }]
    },
    {
      id: 'ex_seated_high_row', name: '앉아서 하이 로우', primaryBodyPartId: 'back',
      sourceBodyPartIds: ['arms', 'back'], secondaryBodyPartIds: null,
      equipmentIds: ['eq_seated_high_row'], difficulty: 'beginner', review: null,
      summary: '가슴 패드에 몸을 지지하고 손잡이를 당기는 등 운동을 알아보세요.',
      instructions: [
        '손잡이가 어깨 높이에 오도록 좌석을 조절하고 발을 바닥이나 발 받침에 둡니다. 가슴을 패드에 가볍게 붙입니다.',
        '손잡이를 쥐고 손목을 팔뚝과 나란히 유지합니다. 어깨를 뒤로, 아래로 두고 몸통을 안정시킵니다.',
        '숨을 내쉬며 팔꿈치를 옆으로 벌려 어깨 높이를 유지한 채 손잡이를 당깁니다. 가슴을 패드에서 떼지 않습니다.',
        '팔꿈치가 어깨와 나란하거나 약간 뒤에 오면 멈춘 뒤 팔을 천천히 펴서 돌아옵니다.'
      ],
      cautions: ['당길 때 몸을 뒤로 젖히거나 허리를 과도하게 꺾지 않습니다.', '돌아올 때 등을 둥글게 말거나 어깨를 앞으로 말지 않습니다.'],
      sources: [{ title: 'ACE · Seated High Back Rows', url: 'https://www.acefitness.org/resources/everyone/exercise-library/169/seated-high-back-rows/', checkedAt: '2026-10-01' }]
    }
  ]
};
