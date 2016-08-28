# Order 模块

## 数据结构

### driver-order

| name        | type     | note         |
| ----        | ----     | ----         |
| id          | uuid     | 主键         |
| type        | int      | 订单类型 1   |
| status-code | int      | 订单状态编码 |
| status      | string   | 订单状态     |
| vehicle     | vehicle  | 车辆         |
| drivers     | [driver] | 增加的司机   |
| summary     | float    | 订单总额     |
| payment     | float    | 订单实付     |

### sale-order

| name        | type         | note              |
| ----        | ----         | ----              |
| id          | uuid         | 主键              |
| type        | int          | 订单类型 2        |
| status-code | int          | 订单状态编码      |
| status      | string       | 订单状态          |
| vehicle     | vehicle      | 车辆              |
| plan        | plan         | 对应的 plan       |
| order-items | [order-item] | 包含的 order-item |
| start\_at   | date         | 合约生效时间      |
| stop\_at    | date         | 合约失效时间      |

### plan-order

| name           |      type | note         |
| ----           |      ---- | ----         |
| id             |      uuid | 主键         |
| type           |       int | 订单类型 0   |
| status-code    |       int | 订单状态编码 |
| vehicle        |   vehicle | 车辆         |
| plans          |    [plan] | 包含的 plan  |
| promotion      | promotion | 促销         |
| service\_ratio |     float | 服务费率     |
| summary        |     float | 订单总额     |
| payment        |     float | 订单实付     |
| expect\_at     |      date | 预计生效日期 |
| start\_at      |      date | 合约生效时间 |
| stop\_at       |      date | 合约失效时间 |

### order-item

| name      | type      | note             |
| ----      | ----      | ----             |
| id        | uuid      | 主键             |
| plan-item | plan-item | 对应的 plan-item |
| price     | float     | 价格             |

### order-event

| name        | type | note                |
| ----        | ---- | ----                |
| id          | uuid | 主键                |
| oid         | uuid | 订单 ID             |
| uid         | uuid | 触发事件的人        |
| data        | json | JSON 格式的事件数据 |
| occurred-at | date | 事件发生时间        |

### order states

![订单状态转换图](img/order-states.svg)

## 数据库结构

### driver-order

| field        | type      | null | default | index   | reference |
| ----         | ----      | ---- | ----    | ----    | ----      |
| id           | uuid      |      |         | primary |           |
| vid          | uuid      |      |         |         | vehicles  |
| status\_code | int       |      | 0       |         |           |
| status       | string    | ✓    |         |         |           |
| summary      | float     |      | 0.0     |         |           |
| payment      | float     |      |         |         |           |
| created\_at  | timestamp |      | now     |         |           |
| updated\_at  | timestamp |      | now     |         |           |

### sale-order

| field        | type      | null | default | index   | reference |
| ----         | ----      | ---- | ----    | ----    | ----      |
| id           | uuid      |      |         | primary |           |
| vid          | uuid      |      |         |         | vehicles  |
| pid          | uuid      |      |         |         | plans     |
| status\_code | int       |      | 0       |         |           |
| status       | string    | ✓    |         |         |           |
| start\_at    | timestamp |      | now     |         |           |
| stop\_at     | timestamp |      | now     |         |           |
| created\_at  | timestamp |      | now     |         |           |
| updated\_at  | timestamp |      | now     |         |           |

### plan-order

| field          | type      | null | default | index   | reference  |
| ----           | ----      | ---- | ----    | ----    | ----       |
| id             | uuid      |      |         | primary |            |
| vid            | uuid      |      |         |         | vehicles   |
| pmid           | uuid      | ✓    |         |         | promotions |
| status\_code   | int       |      | 0       |         |            |
| status         | string    | ✓    |         |         |            |
| service\_ratio | float     |      |         |         |            |
| summary        | float     |      | 0.0     |         |            |
| payment        | float     |      |         |         |            |
| expect\_at     | timestamp |      | now     |         |            |
| start\_at      | timestamp |      | now     |         |            |
| stop\_at       | timestamp |      | now     |         |            |
| created\_at    | timestamp |      | now     |         |            |
| updated\_at    | timestamp |      | now     |         |            |

### order-drivers

| field       | type      | null | default | index   | reference |
| ----        | ----      | ---- | ----    | ----    | ----      |
| id          | uuid      |      |         | primary |           |
| pid         | uuid      |      |         |         | person    |

### order-item

| field | type  | null | default | index   | reference   |
| ----  | ----  | ---- | ----    | ----    | ----        |
| id    | uuid  |      |         | primary |             |
| piid  | uuid  |      |         |         | plan\_items |
| pid   | uuid  |      |         | ✓       |             |
| price | float |      | 0.0     |         |             |

注意：此表的 pid 不是 plan-id 的缩写，是 parent-id 的意思。
可以成为 parent 的有 plan (对应 plan-order)，或者 sale-order。

### order-event

| field        | type      | null | default | index   | reference |
| ----         | ----      | ---- | ----    | ----    | ----      |
| id           | uuid      |      |         | primary |           |
| oid          | uuid      |      |         |         |           |
| uid          | uuid      |      |         |         |           |
| data         | json      |      |         |         |           |
| occurred\_at | timestamp |      |         |         |           |

## 缓存结构

### driver-order

| key                 | type       | value                  | note               |
| ----                | ----       | ----                   | ----               |
| driver-orders       | sorted set | (订单更新时间, 订单ID) | 司机订单汇总       |
| driver-orders-{uid} | sorted set | (订单更新时间, 订单ID) | 每个用户的司机订单 |

### sale-order

| key                 | type       | value                  | note               |
| ----                | ----       | ----                   | ----               |
| driver-orders       | sorted set | (订单更新时间, 订单ID) | 代售订单汇总       |
| driver-orders-{uid} | sorted set | (订单更新时间, 订单ID) | 每个用户的代售订单 |

### plan-order

| key                 | type       | value                  | note               |
| ----                | ----       | ----                   | ----               |
| driver-orders       | sorted set | (订单更新时间, 订单ID) | 计划订单汇总       |
| driver-orders-{uid} | sorted set | (订单更新时间, 订单ID) | 每个用户的计划订单 |

### order

| key    | type | value               | note         |
| ----   | ---- | ----                | ----         |
| orders | hash | 订单ID => 订单 JSON | 所有订单实体 |

## 接口

### 下计划单 placeAnPlanOrder

#### request

| name          | type         | note         |
| ----          | ----         | ----         |
| vid           | uuid         | 车辆 ID      |
| plans         | {pid: items} | 计划 ID 列表 |
| pmid          | uuid         | 促销 ID      |
| service-ratio | float        | 服务费率     |
| summary       | float        | 总价         |
| payment       | float        | 实付         |

其中, items 的结构为: `{piid: price}`。piid 是 plan-item 的 ID。

```javascript
let vid = "00000000-0000-0000-0000-000000000000";
let plans = {
  "00000000-0000-0000-0000-000000000000": {
    "00000000-0000-0000-0000-000000000000": 1000.00,
    "00000000-0000-0000-0000-000000000001": 2000.00
  },
  "00000000-0000-0000-0000-000000000001": {
    "00000000-0000-0000-0000-000000000002": 1000.00,
    "00000000-0000-0000-0000-000000000003": 2000.00
  }
};
let pmid = null;
let service_ratio = 0;
let summary = 6000;
let payment = 6000;

rpc.call("order", "placeAnPlanOrder", vid, plans, pmid, service_ratio, summary, payment)
  .then(function (result) {

  }, function (error) {

  });

```

#### response

| name     | type   | note     |
| ----     | ----   | ----     |
| order-id | uuid   | Order ID |
| order-no | string | Order No |

See [example](../data/order/placeAnPlanOrder.json)

### 获取计划订单列表 getPlanOrders

#### request

| name   | type | note           |
| ----   | ---- | ----           |
| uid    | uuid | User ID        |
| offset | int  | 结果集起始地址 |
| limit  | int  | 结果集大小     |

#### response

| name   | type         | note        |
| ----   | ----         | ----        |
| orders | [plan-order] | Plan Orders |

See [example](../data/order/getPlanOrders.json)

### 获取计划订单详情 getPlanOrder

#### request

| name     | type | note     |
| ----     | ---- | ----     |
| order-id | uuid | Order ID |

#### response

|name|type|note|
|----|----|----|
|order|plan-order|Order 详情|

See [example](../data/order/getPlanOrder.json)

### 下司机单 placeAnDriverOrder

#### request

| name    | type   | note         |
| ----    | ----   | ----         |
| vid     | uuid   | 车辆 ID      |
| dids    | [uuid] | 司机 ID 列表 |
| summary | float  | 总价         |
| payment | float  | 实付         |

```javascript
let vid = "00000000-0000-0000-0000-000000000000";
let dids = [
  "00000000-0000-0000-0000-000000000000",
  "00000000-0000-0000-0000-000000000001",
  "00000000-0000-0000-0000-000000000002",
  "00000000-0000-0000-0000-000000000003"
];
let summary = 200;
let payment = 200;

rpc.call("order", "placeAnDriverOrder", vid, dids, summary, payment)
  .then(function (result) {

  }, function (error) {

  });

```

#### response

| name     | type   | note     |
| ----     | ----   | ----     |
| order-id | uuid   | Order ID |
| order-no | string | Order No |

See [example](../data/order/placeAnDriverOrder.json)

### 获取司机订单列表 getDriverOrders

#### request

| name   | type | note           |
| ----   | ---- | ----           |
| uid    | uuid | User ID        |
| offset | int  | 结果集起始地址 |
| limit  | int  | 结果集大小     |

#### response

| name   | type           | note          |
| ----   | ----           | ----          |
| orders | [driver-order] | Driver Orders |

See [example](../data/order/getDriverOrders.json)

### 获取司机订单详情 getDriverOrder

#### request

| name     | type | note     |
| ----     | ---- | ----     |
| order-id | uuid | Order ID |

#### response

|name|type|note|
|----|----|----|
|order|driver-order|Order 详情|

See [example](../data/order/getDriverOrder.json)

### 下代售单 placeAnSaleOrder

#### request

| name    | type          | note     |
| ----    | ----          | ----     |
| vid     | uuid          | 车辆 ID  |
| items   | {piid: price} | 代售条目 |
| summary | float         | 总价     |
| payment | float         | 实付     |

```javascript
let vid = "00000000-0000-0000-0000-000000000000";
let items = {
  "00000000-0000-0000-0000-000000000000": 1000,
  "00000000-0000-0000-0000-000000000001": 2000
};
let summary = 2000;
let payment = 2000;

rpc.call("order", "placeAnSaleOrder", vid, items, summary, payment)
  .then(function (result) {

  }, function (error) {

  });

```

#### response

| name     | type   | note     |
| ----     | ----   | ----     |
| order-id | uuid   | Order ID |
| order-no | string | Order No |

See [example](../data/order/placeAnSaleOrder.json)

### 获取司机订单列表 getSaleOrders

#### request

| name   | type | note           |
| ----   | ---- | ----           |
| uid    | uuid | User ID        |
| offset | int  | 结果集起始地址 |
| limit  | int  | 结果集大小     |

#### response

| name   | type           | note        |
| ----   | ----           | ----        |
| orders | [driver-order] | Sale Orders |

See [example](../data/order/getSaleOrders.json)

### 获取司机订单详情 getSaleOrder

#### request

| name     | type | note     |
| ----     | ---- | ----     |
| order-id | uuid | Order ID |

#### response

|name|type|note|
|----|----|----|
|order|sale-order|Order 详情|

See [example](../data/order/getSaleOrder.json)
