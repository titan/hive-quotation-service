# Vehicle Model 模块

## 数据结构

### vehicle-model

|name|type|note|
|----|----|----|
|range|string|车系|
|models|[model]|车型|

### model

|name|type|note|
|----|----|----|
|model|string|车型名称|
|gearbox|[string]|可选变速箱|
|displacement|[string]|可选排量|

## 接口

### 按厂商获得车型 getVehicleModelsByMake

#### request

|name|type|note|
|----|----|----|
|make|string|厂商|

##### example

```javascript
var uid = "Smart";

rpc.call("vehicle-model", "getVehicleModelsByMake", make)
  .then(function (result) {

  }, function (error) {

  });
```

#### response

|name|type|note|
|----|----|----|
|vehicle-model|vehicle-model|Vehicle Model|

See [example](../data/vehicle-model/getVehicleModelsByMake.json)
