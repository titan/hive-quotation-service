# Plan 模块

## 数据结构

### plan

| name         | type        | note       |
| ----         | ----        | ----       |
| title        | string      | 标题       |
| description  | string      | 描述       |
| image        | string      | 头图       |
| thumbnail    | string      | 缩略图     |
| period       | integer     | 互助期     |
| rules        | [plan-rule] | 互助规则   |
| items        | [plan-item] | 计划条目   |
| joined-count | integer     | 已加入车辆 |


### plan-rule

| name        | type   | note |
| ----        | ----   | ---- |
| name        | string | 名称 |
| title       | string | 标题 |
| description | string | 描述 |

### plan-item

| name        | type   | note |
| ----        | ----   | ---- |
| title       | string | 标题 |
| description | string | 描述 |

## 数据库结构

### plans

| field       | type       | null | default | index   | reference |
| ----        | ----       | ---- | ----    | ----    | ----      |
| id          | uuid       |      |         | primary |           |
| title       | char(128)  |      |         |         |           |
| description | text       | ✓    |         |         |           |
| image       | char(1024) | ✓    |         |         |           |
| thumbnail   | char(1024) | ✓    |         |         |           |
| period      | integer    |      | 365     |         |           |
| created\_at | timestamp  |      | now     |         |           |
| updated\_at | timestamp  |      | now     |         |           |

### plan\_rules

| field       | type      | null | default | index   | reference |
| ----        | ----      | ---- | ----    | ----    | ----      |
| id          | uuid      |      |         | primary |           |
| pid         | uuid      |      |         |         | plans     |
| name        | char(128) | ✓    |         |         |           |
| title       | char(128) |      |         |         |           |
| description | text      | ✓    |         |         |           |
| created\_at | timestamp |      | now     |         |           |
| updated\_at | timestamp |      | now     |         |           |

### plan\_items

| field       | type      | null | default | index   | reference |
| ----        | ----      | ---- | ----    | ----    | ----      |
| id          | uuid      |      |         | primary |           |
| pid         | uuid      |      |         |         | plans     |
| title       | char(128) |      |         |         |           |
| description | text      | ✓    |         |         |           |
| created\_at | timestamp |      | now     |         |           |
| updated\_at | timestamp |      | now     |         |           |

### 

## 接口

### 获取可加入计划

#### request

| name | type | note    |
| ---- | ---- | ----    |
| uid  | uuid | 用户 ID |

##### example

```javascript
var uid = "00000000-0000-0000-0000-000000000000";
rpc.call("plan", "getAvailablePlans", uid)
  .then(function (data) {

  }, function (err) {

  });
```

#### response

| name | type   | note      |
| ---- | ----   | ----      |
| plan | [plan] | plan 列表 |

See [example](../data/plan/getAvailablePlans.json)

### 获取已加入计划

#### request

| name | type | note    |
| ---- | ---- | ----    |
| uid  | uuid | 用户 ID |

##### example

```javascript
var uid = "00000000-0000-0000-0000-000000000000";
rpc.call("plan", "getJoinedPlans", uid)
  .then(function (data) {

  }, function (err) {

  });
```

#### response

| name | type   | note      |
| ---- | ----   | ----      |
| plan | [plan] | plan 列表 |

See [example](../data/plan/getJoinedPlans.json)

### 获取计划 getPlan

#### request

| name | type | note    |
| ---- | ---- | ----    |
| pid  | uuid | 计划 ID |

##### example

```javascript
var pid = "00000000-0000-0000-0000-000000000000";
rpc.call("plan", "getPlan", pid )
  .then(function (data) {

  }, function (error) {

  });
```

#### response

| name | type | note |
| ---- | ---- | ---- |
| plan | plan | 计划 |

See [example](../data/plan/getPlan.json)

### 增加已加入车辆数量 increaseJoinedCount

不能从 mobile 域调用!

#### request

| name | type | note    |
| ---- | ---- | ----    |
| pid  | uuid | 计划 ID |

##### example

```javascript
var pid = "00000000-0000-0000-0000-000000000000";
rpc.call("plan", "increaseJoinedCount", pid )
  .then(function (data) {

  }, function (error) {

  });
```

#### response

| name  | type | note           |
| ----  | ---- | ----           |
| count | int  | 增加后的车辆数 |

See [example](../data/plan/increaseJoinedCount.json)

### 减少已加入车辆数量 decreaseJoinedCount

不能从 mobile 域调用!

#### request

| name | type | note    |
| ---- | ---- | ----    |
| pid  | uuid | 计划 ID |

##### example

```javascript
var pid = "00000000-0000-0000-0000-000000000000";
rpc.call("plan", "decreaseJoinedCount", pid )
  .then(function (data) {

  }, function (error) {

  });
```

#### response

| name  | type | note           |
| ----  | ---- | ----           |
| count | int  | 减少后的车辆数 |

See [example](../data/plan/decreaseJoinedCount.json)

### 设置已加入车辆数量 setJoinedCounts

不能从 mobile 域调用!

#### request

| name   | type              | note    |
| ----   | ----              | ----    |
| params | [{uuid, integer}] | 计划 ID |

{uuid, integer} 是 TypeScript 里的 tuple 类型，在 JavaScript 里用 [uuid, integer] 来代替。


##### example

```javascript
let params = [["00000000-0000-0000-0000-000000000000", 1000], ["00000000-0000-0000-0000-000000000001", 200]];
rpc.call("plan", "setJoinedCount", params)
  .then(function (data) {

  }, function (error) {

  });
```

#### response

| name   | type   | note     |
| ----   | ----   | ----     |
| code   | int    | 结果编码 |
| status | string | 结果内容 |

| code  | status   | meaning |
| ----  | ----     | ----    |
| 200   | null     | 成功    |
| other | 错误信息 | 失败    |

See [example](../data/plan/setJoinedCount.json)
