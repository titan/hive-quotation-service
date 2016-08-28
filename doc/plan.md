# Plan 模块

## 数据结构

### plan

| name         | type    | note       |
| ----         | ----    | ----       |
| title        | string  | 标题       |
| description  | string  | 描述       |
| image        | string  | 头图       |
| thumbnail    | string  | 缩略图     |
| period       | integer | 互助期     |
| joined-count | integer | 已加入车辆 |


### plan-rule

|name|type|note|
|----|----|----|
|pid|uuid|计划类型|
|name|string|名称|
|title|string|标题|
|description|string|描述|

### plan-item

|name|type|note|
|----|----|----|
|pid|uuid|计划类型|
|title|string|标题|
|description|string|描述|
|price|float|价格|

## 接口

### 获取可加入计划

#### request

|name|type|note|
|----|----|----|
|uid|uuid|用户 ID|

##### example

```javascript
var uid = "00000000-0000-0000-0000-000000000000";
rpc.call("plan", "getAvailablePlans", uid)
  .then(function (data) {

  }, function (err) {

  });
```

#### response

|name|type|note|
|----|----|----|
|plan|[plan]|plan 列表|

See [example](../data/plan/getAvailablePlans.json)

### 获取已加入计划

#### request

|name|type|note|
|----|----|----|
|uid|uuid|用户 ID|

##### example

```javascript
var uid = "00000000-0000-0000-0000-000000000000";
rpc.call("plan", "getJoinedPlans", uid)
  .then(function (data) {

  }, function (err) {

  });
```

#### response

|name|type|note|
|----|----|----|
|plan|[plan]|plan 列表|

See [example](../data/plan/getJoinedPlans.json)

### 获取计划条目

#### request

|name|type|note|
|----|----|----|
|pid|uuid|计划 ID|

##### example

```javascript
var pid = "00000000-0000-0000-0000-000000000000";
rpc.call("plan", "getPlanItems", pid )
  .then(function (data) {

  }, function (error) {

  });
```

#### response

|name|type|note|
|----|----|----|
|plan-items|[plan-item]|plan 条目列表|

See [example](../data/plan/getPlanItems.json)

