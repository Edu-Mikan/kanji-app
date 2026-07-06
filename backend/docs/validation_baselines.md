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
- Validator: validateThreeVerticalZones

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
