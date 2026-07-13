## Validation Baselines

Este documento recoge resultados de referencia para los patrones de validación estructural.  
Sirve para comprobar que futuros cambios en descriptor_validator.js o kanji_descriptors.json no rompen patrones ya ajustados.

---

### Baseline inicial para 山 y 口 - 2026-07-06

#### Resumen global

Total samples: 36  
Total kanjis: 2  
Manual correct: 20  
Manual incorrect: 16  
False negatives: 0  
False positives: 0

Validation strategies:  
{"descriptor_box_pattern":17,"descriptor_three_vertical_zones":19}

---

#### 山 - three_vertical_zones

##### Código relacionado

- Descriptor: kanji_descriptors.json -> 山
- Pattern: three_vertical_zones

##### Resultado de referencia

Samples: 19  
Correct / Incorrect: 12 / 7  
False negatives: 0  
False positives: 0  
Correct with score 10: 0  
Incorrect with score 10: 7  
Validation strategies: {"descriptor_three_vertical_zones":19}

##### Decisión

Estado: baseline aceptada.

---

#### 口 - box_pattern

##### Código relacionado

- Descriptor: kanji_descriptors.json -> 口
- Pattern: box_pattern
- Validator: validateBoxPattern

##### Resultado de referencia

Samples: 17  
Correct / Incorrect: 8 / 9  
False negatives: 0  
False positives: 0  
Correct with score 10: 0  
Incorrect with score 10: 9  
Validation strategies: {"descriptor_box_pattern":17}

##### Decisión

Estado: baseline aceptada.

---

### 日 - box_with_inner_horizontal

Fecha: 2026-07-06

#### Código relacionado

- Descriptor: kanji_descriptors.json -> 日
- Pattern: box_with_inner_horizontal
- Validator: validateBoxWithInnerHorizontal

#### Resultado de referencia

Manual correct: 9  
Manual incorrect: 9  
False negatives: 0  
False positives: 1  
Validation strategies: {"descriptor_box_with_inner_horizontal":18}

#### Decisión

Se acepta esta baseline candidata aunque exista 1 falso positivo conocido.

Motivo:

- No hay falsos negativos.
- Se prioriza evitar rechazar dibujos correctos.
- El falso positivo detectado no se considera crítico para la experiencia de usuario.

Estado: baseline candidata aceptada.

---

### 目 - box_with_two_inner_horizontals

Fecha: 2026-07-07

#### Código relacionado

- Descriptor: kanji_descriptors.json -> 目
- Pattern: box_with_two_inner_horizontals
- Validator: validateBoxWithTwoInnerHorizontals

#### Resultado de referencia

Total samples: 12  
Manual correct: 7  
Manual incorrect: 5  
False negatives: 0  
False positives: 0  
Correct with score 10: 0  
Incorrect with score 10: 5

Validation strategies: {"descriptor_box_with_two_inner_horizontals":12}

#### Observaciones

Los fallos duros aparecen únicamente en muestras incorrectas.

Checks relevantes en incorrectos:

```txt
strokeCount
leftStrokeIsLeft
leftStrokeHasHeight
outerStrokeHasWidth
outerStrokeHasCorner
upperInnerStrokeYInRange
upperBelowOuterTop
lowerInsideBoxX
```

---

### 田 - box_with_inner_cross

Fecha: 2026-07-07

#### Código relacionado

- Descriptor: kanji_descriptors.json -> 田
- Pattern: box_with_inner_cross
- Validator: validateBoxWithInnerCross

#### Resultado de referencia

Total samples: 16  
Manual correct: 12  
Manual incorrect: 4

False negatives: 0  
False positives: 2

Correct with score 10: 0  
Incorrect with score 10: 2

Validation strategies: {"descriptor_box_with_inner_cross":16}

Structural validation:

```txt
simple=0, descriptor=16
```

#### Observaciones

Falso positivo conocido: 田 vs 用
Se detecta una confusión conocida entre 田 y 用.
En algunos casos, un dibujo similar a 用 puede pasar el descriptor de 田 porque ambos comparten una estructura visual parecida.

---

### Regression check global - 2026-07-07

#### Kanjis incluidos

- 口
- 山
- 日
- 目
- 田

#### Resultado global

Total samples: 82  
Total kanjis: 5

Manual correct: 48  
Manual incorrect: 34

False negatives: 0  
False positives: 3

Score median: 0.500  
Score average: 4.091

Validation strategies:

```txt
{"descriptor_box_with_inner_cross":16,"descriptor_box_pattern":17,"descriptor_three_vertical_zones":19,"descriptor_box_with_inner_horizontal":18,"descriptor_box_with_two_inner_horizontals":12}
```

---

### 回 - nested_box_pattern

Fecha: 2026-07-07

#### Código relacionado

- Descriptor: kanji_descriptors.json -> 回
- Pattern: nested_box_pattern
- Validator: validateNestedBoxPattern

#### Resultado de referencia

Total samples: 31  
Manual correct: 18  
Manual incorrect: 13

False negatives: 0  
False positives: 0

Correct with score 10: 0  
Incorrect with score 10: 13

Validation strategies: {"descriptor_nested_box_pattern":31}

Structural validation:

```txt
simple=0, descriptor=31
```

---

### 用 - open_box_with_inner_vertical_and_horizontals

Fecha: 2026-07-07

#### Código relacionado

- Descriptor: kanji_descriptors.json -> 用
- Pattern: open_box_with_inner_vertical_and_horizontals
- Validator: validateOpenBoxWithInnerVerticalAndHorizontals

#### Resultado de referencia

Total samples: 24  
Manual correct: 13  
Manual incorrect: 11

False negatives: 0  
False positives: 1

Correct with score 10: 0  
Incorrect with score 10: 10

Validation strategies: {"descriptor_open_box_with_inner_vertical_and_horizontals":24}

Structural validation:

---

### 木 - tree_cross_pattern

Fecha: 2026-07-07

#### Código relacionado

- Descriptor: kanji_descriptors.json -> 木
- Pattern: tree_cross_pattern
- Validator: validateTreeCrossPattern

#### Resultado de referencia

Resultado obtenido mediante revalidación con el validador actual.

Total samples: 52  
Manual correct: 47  
Manual incorrect: 5

False negatives: 0  
False positives: 0

Correct with score 10: 0  
Incorrect with score 10: 5

Validation strategies: {"descriptor_tree_cross_pattern":52}

Structural validation:

```txt
simple=0, descriptor=52
```

---

### 本 - tree_with_bottom_mark

Fecha: 2026-07-08

#### Código relacionado

- Descriptor: kanji_descriptors.json -> 本
- Pattern: tree_with_bottom_mark
- Validator: validateTreeWithBottomMark

#### Resultado de referencia

Resultado obtenido mediante revalidación con el validador actual.

Total samples: 27  
Manual correct: 17  
Manual incorrect: 10

False negatives: 0  
False positives: 0

Correct with score 10: 0  
Incorrect with score 10: 10

Validation strategies: {"descriptor_tree_with_bottom_mark":27}

Structural validation:

```txt
simple=0, descriptor=27
```

---

### 未 / 末 - tree_with_two_horizontals

Fecha: 2026-07-08

#### Código relacionado

- Descriptor: kanji_descriptors.json -> 未
- Descriptor: kanji_descriptors.json -> 末
- Pattern: tree_with_two_horizontals
- Validator: validateTreeWithTwoHorizontals

#### Resultado de referencia - 未

Total samples: 22  
Manual correct: 14  
Manual incorrect: 8

False negatives: 0  
False positives: 1

Correct with score 10: 0  
Incorrect with score 10: 7

Falso positivo aceptado por ambigüedad 未/末:

```txt
5e110a9a-d0f8-49aa-9c08-b377ea6c870c
```
