# AQUA-07 · Water Game Arcade EX

<div align="center">

![Water Game Arcade EX](https://img.shields.io/badge/AQUA--07-Water_Game_Arcade_EX-4de6e7?style=for-the-badge)
![Three.js](https://img.shields.io/badge/Three.js-0.160-black?style=for-the-badge&logo=threedotjs)
![Rapier](https://img.shields.io/badge/Rapier-3D_WASM-ffcf66?style=for-the-badge)

**El juguete clásico de aros acuáticos dentro de un mini submarino futurista.**

</div>

---

## Estado actual

La referencia visible actual es **BUILD R36**.

AQUA-07 es una aplicación web estática que combina una carcasa de juguete acuático, una escena Three.js y una simulación física local con Rapier 3D/WASM. El juego funciona sin servidor de aplicación y conserva el progreso localmente; Firebase es opcional para el ranking global.

Incluye:

- visor de observación con agua, profundidad, luces y burbujas;
- 20 aros 3D con colisión, giro, masa e inercia;
- tres palos físicos con alturas, requisitos de color y movimiento;
- chorros que aplican fuerzas y torque reales de Rapier;
- inclinación horizontal y vertical con teclado, botones táctiles, mando o giroscopio;
- botón accesible de reajuste angular con cargas limitadas;
- auditoría física redundante para no perder aros que sí han quedado ensartados;
- ranking local/global, perfil, paletas de accesibilidad, música y sonido procedural.

## Objetivo y reglas

Ensarta los **20 aros** en los tres palos. El nivel se completa cuando hay al menos **5 aros en cada palo**; los niveles 6–10 añaden objetivos de color.

Un aro solo debe contar cuando atraviesa el interior del agujero, queda dentro del rango del palo y se estabiliza. Los roces por fuera, los aros en vuelo y los aros que simplemente se detienen junto a la punta no puntúan.

El eje Z no está bloqueado: el aro puede moverse en profundidad dentro del tanque. Las paredes físicas solo delimitan el volumen jugable.

## Controles completos

| Acción | Teclado | Panel táctil | Mando |
| --- | --- | --- | --- |
| Chorro izquierdo | Mantener `A` | Mantener botón rojo | Botón frontal 1 |
| Chorro central | Mantener `S` | Mantener botón verde | Botón frontal 2 |
| Chorro derecho | Mantener `D` | Mantener botón azul | Botón frontal 3 |
| **Reajuste horizontal del tablero, X** | Mantener `←` / `→` | Flechas laterales | Cruceta / stick izquierdo |
| **Reajuste vertical del tablero, Y** | Mantener `↑` / `↓` | Flechas doradas | Cruceta / stick izquierdo |
| **Reajuste angular / aplanado** | `Tab` hasta enfocar `↻`, después `Espacio` o `Enter` | Pulsar botón morado `↻` | — |
| Reiniciar nivel | `R` | Botón `↺` | — |
| Abrir menú | — | Botón `☰` | — |

### Diferencia entre los dos reajustes

- `← →` es el **reajuste horizontal del tablero**: inclina físicamente el tanque en el eje X y desplaza los aros mediante fuerzas reales.
- `↑ ↓` es el reajuste vertical del tablero: inclina el tanque en el eje Y.
- `↻` es el **reajuste angular o aplanado**: no mueve el aro de sitio; aplica un impulso angular de Rapier para que un aro libre se aproxime a una orientación plana.

El botón `↻` muestra las cargas restantes como `10/10`. Cada pulsación consume una carga únicamente si al menos un aro libre recibe el impulso. Hay **10 cargas por partida** y cada uso tiene una corrección máxima aproximada de **30°**.

El aplanado solo afecta aros libres. No afecta aros encestados, asentados, capturados ni a un aro que la auditoría ya reconoce como físicamente estable dentro de un palo. No cambia la posición ni escribe el quaternion del cuerpo.

En teclado no existe un atajo global accidental para el aplanado: hay que enfocar conscientemente el botón `↻` con `Tab` y activarlo con `Espacio` o `Enter`. Cuando el giroscopio está activo, las flechas quedan sustituidas visualmente por la inclinación del teléfono, pero `↻` sigue disponible y conserva su estado independiente.

## Cómo encestar un aro

1. Usa `A`, `S` o `D`, o los botones de chorro, para acercar el aro al palo.
2. Usa `← →` para centrarlo horizontalmente y `↑ ↓` para ajustar su altura.
3. Alinea el agujero con la punta; no intentes entrar rozando el lateral.
4. Desciende con poca velocidad y deja que el contacto físico termine de asentar el aro.
5. Mantén en cuenta que un aro asentado pesa más: los chorros y la inclinación pueden liberarlo, pero requieren insistencia.

Los niveles 5 y 10 tienen palos móviles separados cerca de los laterales útiles del tanque. El mismo recorrido horizontal se usa en escritorio y móvil; solo cambia el encuadre de la cámara para adaptarse al formato de la pantalla.

## Auditoría redundante de encestes

El contacto inicial de Rapier y el registro de puntuación son rutas separadas. Para cubrir un contacto físico que no haya emitido el evento esperado, el juego realiza una auditoría aproximadamente cada **0,22 segundos después de un paso de Rapier**.

La auditoría exige dos muestras estables y comprueba:

- pertenencia estricta al interior del eje del palo;
- posición dentro del rango vertical del palo;
- aro por debajo de la punta, no simplemente junto a ella;
- orientación suficientemente plana;
- velocidad lineal y angular bajas;
- capacidad disponible del palo.

Cuando se cumplen esas condiciones, se utiliza la misma ruta normal de registro. Se actualizan `ring.scored`, `ring.seated`, `ring.pole`, `pole.rings`, marcador, combo, etiquetas y condición de victoria sin recolocar el cuerpo.

También se repara la inconsistencia inversa: si `ring.scored` es verdadero pero el aro falta de `pole.rings`, se reconstruye la membresía sin volver a sumar los puntos. Las membresías de aros libres se eliminan para evitar que un aro no ensartado aparezca contabilizado.

## Mecánica física

### Motor y paso

La simulación usa **Rapier 3D 0.20.0** distribuido localmente en `vendor/rapier.mjs`. No se usa Cannon-es ni un motor físico alternativo.

- Gravedad: `-5.6`.
- Paso fijo: `1/90` en escritorio y `1/75` en móvil.
- Solver: 16 iteraciones en escritorio, 10 en móvil y 2 subiteraciones PGS.
- CCD y soft-CCD en los cuerpos dinámicos.
- Contactos aro-aro activos.
- Fricción y restitución bajas para evitar rebotes violentos y enganches.
- Ningún aro recibe un carril Z, un lock cinemático o una pared invisible para guiarlo.

### Colliders y cuerpos

- Cada aro usa una corona de esferas sobre el toro visual: 16 en escritorio y 12 en móvil.
- El palo usa una envolvente convexa trapezoidal, una esfera en la punta y un collider para la base.
- El collider del palo conserva la conicidad y las cotas del modelo visible.
- El suelo, las paredes laterales, las paredes de profundidad y el guard superior son fixtures fijos de Rapier.
- Los cuerpos dinámicos no reciben correcciones manuales de posición o quaternion para resolver contactos.
- Jets, inclinación, breakaway y aplanado utilizan fuerzas, torques o impulsos reales del `RigidBody`.

### Masa de los aros asentados

```js
const RING_MASS = .72;
const RING_SEATED_MASS = RING_MASS * 4.5;
```

Cuando un aro entra correctamente en un palo, su masa e inercia real pasan a ser 4,5 veces mayores para que la pila no se desarme con cualquier roce. Esa misma masa gobierna jets, inclinación y asistencia angular. No existe `controlMass`.

La presión de los chorros y la inclinación pueden aplicar fuerza en el borde de un aro asentado para romper el contacto eje-base. Si el cuerpo se separa físicamente, la salida se registra con un impulso de Rapier; no hay teletransporte.

### Aplanado

El aplanado se aplica con `RigidBody.applyAngularImpulse`. El juego calcula el sentido hacia la normal vertical y limita el objetivo de cada activación a aproximadamente 30°. Nunca cambia directamente la posición ni el quaternion del cuerpo.

La función de agitar el teléfono está eliminada. No se registra ninguna API de movimiento para disparar el aplanado. El giroscopio queda reservado a la inclinación consciente del tablero.

## Niveles y puntuación

Hay diez niveles:

- **1–3:** alturas y posiciones clásicas.
- **4 y 9:** movimiento controlado de un palo.
- **5 y 10:** movimiento múltiple, separación horizontal ampliada y recorrido cercano a los laterales del tanque.
- **6–10:** requisitos de color y combinaciones más exigentes.

La distribución espacial de los niveles 5 y 10 es compartida entre escritorio y móvil. La cámara adapta el encuadre, pero los palos y sus recorridos físicos usan las mismas coordenadas.

Puntuación:

- aro base: **100 puntos**;
- combo consecutivo por color: multiplica la puntuación del siguiente aro;
- cinco aros del mismo color en un palo: **+500**;
- dos combos de color en un palo: **+1500**;
- bonus de tiempo al completar el nivel;
- bonus adicional por cumplir requisitos de color.

## Interfaz y accesibilidad

La interfaz conserva el formato vertical de juguete tanto en escritorio como en móvil, sin convertir el escritorio en una versión horizontal diferente.

- Cabecera con título y build visible, también bajo el área segura de móviles.
- Visor móvil casi a borde para aprovechar el ancho útil.
- HUD de nivel, puntos, tiempo, aros y combo.
- Controles táctiles con `pointer capture` para que no se queden pulsados al sacar el dedo.
- Botón de aplanado con contador, etiqueta ARIA dinámica y activación nativa de teclado.
- Al activar el giroscopio, solo se atenúan las flechas que quedan sustituidas; el botón `↻` permanece independiente.
- Paletas Normal, Deuteranopia, Protanopia, Tritanopia y Alto contraste.
- Música, sonido, pantalla completa, ranking local/global y perfil.
- Los mensajes de juego aparecen dentro del visor y no cubren la zona de controles.

## Audio y agua

El audio se genera de forma procedural y opcional:

- chorros, burbujas, contactos y salidas físicas;
- combos y victoria;
- melodía submarina variable por nivel.

El agua utiliza materiales y geometría Three.js con caústicas, burbujas y ondas ligeras. La distorsión acuática avanzada queda pospuesta hasta poder sustituir el ondeo actual por un efecto más convincente sin reducir la legibilidad de los aros.

## Ejecutar localmente

Es una aplicación estática con módulos ES locales:

```bash
python3 -m http.server 8080
```

Abre después [http://localhost:8080](http://localhost:8080). No abras `index.html` directamente con `file://`, porque el navegador puede bloquear los imports de módulos y el WASM.

Para probar el preview de esta sesión:

```bash
python3 -m http.server 4173 --bind 0.0.0.0
```

## Arquitectura

```text
index.html                  → carcasa, visor, HUD, controles, menús y tutorial
styles.css                  → tema del submarino, layout responsive y accesibilidad
game3d.js                   → Three.js, Rapier, gameplay, auditoría, niveles, audio y Firebase
vendor/three.module.js      → runtime local de Three.js 0.160.0
vendor/rapier.mjs           → runtime WASM local de Rapier 3D 0.20.0
vendor/rapier-physics.js    → adaptador ligero de cuerpos y colliders Rapier
vendor/RAPIER-LICENSE       → licencia Apache-2.0 de Rapier
vendor/THREE-LICENSE        → licencia MIT de Three.js
```

El adaptador local expone vectores mutables, colliders compuestos, masas, fuerzas, torques e impulsos directos sobre los `RigidBody` de Rapier. Las fuerzas y torques se reinician explícitamente después de cada integración porque la API nativa los conserva entre pasos.

## Persistencia y Firebase

El progreso y el ranking local funcionan sin configuración. La integración opcional de Firebase conserva autenticación anónima, progreso y ranking global. Si Firebase no está disponible, la interfaz pasa a modo **Solo local** sin bloquear la partida.

Para conectar otro proyecto, sustituye `FIREBASE_CONFIG` en `game3d.js` y habilita Authentication anónima y Firestore.

## Validación de BUILD R36

```text
node --check game3d.js
node --check vendor/rapier-physics.js
git diff --check
Preview HTTP 200
Auditoría de asiento, reparación de ring.scored/pole.rings y salida física
Prueba de masa asentada 4.5x, jets, inclinación y aplanado angular
Prueba de layout responsive, cabecera móvil, contador 10/10 y tutorial interactivo
Prueba de niveles 5 y 10 con recorrido de palos compartido entre móvil y escritorio
Comprobación estática de ausencia de agitación y atajo global de Espacio
```

## Licencia

El proyecto se distribuye bajo la licencia indicada en [LICENSE](LICENSE). Rapier y Three.js conservan sus licencias en `vendor/`.

## Créditos

**Creado por:** [orochi_iory](https://github.com/orochi-iory)

**Desarrollado con:** asistencia de IA, Three.js y Rapier.
