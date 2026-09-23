# AQUA-07 · Water Game Arcade EX

<div align="center">

![Water Game Arcade EX](https://img.shields.io/badge/AQUA--07-Water_Game_Arcade_EX-4de6e7?style=for-the-badge)
![Three.js](https://img.shields.io/badge/Three.js-0.160-black?style=for-the-badge&logo=threedotjs)
![Rapier](https://img.shields.io/badge/Rapier-3D_WASM-ffcf66?style=for-the-badge)

**El juguete clásico de aros acuáticos dentro de un mini submarino futurista.**

</div>

---

## Concepto

**AQUA-07** mezcla la carcasa colorida de un juguete infantil de agua con la instrumentación de un submarino experimental. El tablero se dibuja con Three.js y los cuerpos rígidos se resuelven con Rapier 3D/WASM local.

La referencia visible actual es **BUILD R22**.

- Pantalla de observación con brillo, visor y lectura de instrumentos.
- Casco oscuro remachado, señalética de laboratorio y panel de control de juguete.
- Tres chorros de colores, botones de presión y controles de inclinación.
- Aros 3D con colisión, rotación, masa, inercia y contactos reales.
- Música procedural submarina y efectos de agua generados en el navegador.

## Cómo jugar

Ensarta los **20 aros** en los tres palos. Para completar un nivel hacen falta al menos **5 aros en cada palo**. Los niveles 6–10 también añaden objetivos de color.

| Acción | Teclado | Panel táctil | Mando |
| --- | --- | --- | --- |
| Chorro izquierdo | `A` | Botón rojo | Botón frontal 1 |
| Chorro central | `S` | Botón verde | Botón frontal 2 |
| Chorro derecho | `D` | Botón azul | Botón frontal 3 |
| Inclinación X | `←` / `→` | Botones laterales | Cruceta / stick izquierdo |
| Inclinación Y | `↑` / `↓` | Botones dorados | Cruceta / stick izquierdo |
| Reiniciar | `R` | `↺` | — |
| Menú | — | `☰` | — |

Mantén pulsado un control para aplicar fuerza. Al soltarlo, la entrada vuelve progresivamente a cero. En móvil se puede activar el giroscopio y calibrarlo desde el indicador `GYRO`.

## Mecánica física

### Motor

La simulación usa **Rapier 3D 0.20.0**, distribuido localmente en `vendor/rapier.mjs`. No depende de un CDN ni de Cannon-es.

- Gravedad: `-5.6`.
- Paso fijo: `1/90` en escritorio y `1/75` en móvil.
- Solver Rapier: 16 iteraciones en escritorio, 10 en móvil y 2 subiteraciones PGS.
- CCD activado en los aros, con dos subpasos y soft-CCD para evitar atravesar suelo, palos o paredes.
- Contactos aro-aro activos en todo momento.
- Fricción y restitución bajas para evitar rebotes violentos y enganches.
- El eje Z está libre: no existe un carril cinemático. Las paredes laterales únicamente delimitan el volumen estrecho del tanque.

### Colliders

- Cada aro utiliza una corona de esferas distribuidas sobre su toro visible: 16 en escritorio y 12 en móvil.
- Las esferas tienen una piel de contacto mínima para mantener separados los aros sin corregir su posición visualmente.
- El palo usa una envolvente convexa trapezoidal que conserva la conicidad visible, una esfera en la punta y un collider para la base.
- El suelo conserva la misma cota que la plataforma visible y tiene espesor físico hacia abajo.
- Las paredes laterales y de profundidad son gruesas para evitar tunneling.
- Un guard superior físico queda justo por encima del topRim visible: evita que un aro atraviese el techo sin dejar una franja donde parezca escapar. Usa fricción nula y restitución corta.
- Rapier usa CCD en las superficies que participan en la jugabilidad; no hay correcciones manuales de posición para rescatar un aro.
- Al inclinar o activar un chorro sobre un aro ya asentado, la presión se aplica también en el borde del aro. El torque y el levantamiento rompen el contacto eje-base mediante Rapier; si el cuerpo se separa físicamente del palo, la salida se registra sin teletransporte.

### Masa e inclinación

```js
const RING_MASS = .72;
const RING_SEATED_MASS = RING_MASS * 4.5;
```

Cuando un aro entra en el interior de un palo, Rapier recibe una masa e inercia 4.5 veces mayores. Es una concesión deliberada para la jugabilidad: la pila no se desarma con cualquier roce, pero sigue pudiendo salir si se mantiene suficiente inclinación o chorro. La misma masa real gobierna ambas entradas y las fuerzas no usan `controlMass`.

Los aros no se teletransportan ni se recolocan al puntuar. El apilado final se produce por contacto entre colliders, suelo, palo y gravedad.

### Captura y salida

La captura es estricta:

1. El centro del aro debe aproximarse al interior del agujero.
2. El aro debe descender razonablemente alineado.
3. La comprobación usa el diámetro interior, nunca el diámetro exterior.
4. Un roce lateral no puntúa ni cambia la masa.
5. Si el cruce de plano queda oculto por un subpaso CCD, un contacto interior ya situado bajo la punta puede completar la captura; el radio sigue siendo el interior del agujero.
6. El contacto físico con el palo permanece activo después de la captura.
7. Una salida por encima de la punta usa un impulso físico; no hay salto por teletransporte.

Solo durante el descenso existe una asistencia angular muy suave para que un aro que llega de canto pueda ladearse y descansar. Cuando deja de descender, conserva libremente su giro y orientación.

### Chorros

Los chorros son fuerzas físicas aplicadas en el centro de masa del aro. Para un aro ya asentado, una segunda componente alcanza su borde desde la posición física del chorro y permite romper el contacto eje-base mediante torque; no recoloca el aro ni crea una guía rígida. Esto evita que el chorro lo mueva sin llegar a sacarlo del palo.

La flotación, la amortiguación, la turbulencia y la resistencia angular pertenecen a la capa de agua. No hay penalización temporizada ni expulsiones rojas ocultas.

## Niveles y puntuación

Hay diez niveles:

- **1–5:** niveles clásicos con distintas alturas y movimiento.
- **6–10:** objetivos de color, palos móviles y combinaciones más exigentes.

Puntuación:

- Aro base: **100 puntos**.
- Combo por color: multiplica el siguiente aro consecutivo.
- Cinco aros del mismo color en un palo: **+500**.
- Dos combos de color en un palo: **+1500**.
- Bonus de tiempo al completar el nivel.
- Bonus adicional por cumplir requisitos de color.

## Interfaz y accesibilidad

La interfaz actual se ha rehecho como un panel de submarino futurista con detalles de juguete:

- visor de observación con marco de escotilla;
- casco oscuro con remaches, telemetría y etiquetas de laboratorio;
- HUD de profundidad con tiempo, puntos, aros y combo;
- botones blandos de colores para los chorros;
- controles dorados para la inclinación;
- menú, tutorial, ranking local/global, perfil y pantalla completa;
- paletas Normal, Deuteranopia, Protanopia, Tritanopia y Alto contraste;
- cada aro conserva una forma visual además del color;
- controles táctiles con `pointer capture` para que no se queden pulsados accidentalmente;
- teclado y mando con limpieza de estado al reiniciar.

## Audio

El audio es procedural y opcional:

- chorros y burbujas;
- contactos y salidas físicas;
- combos y victoria;
- melodía submarina ligera y variable por nivel.

No se incluyen canciones ni muestras externas. El navegador necesita una interacción del usuario para activar el contexto de audio.

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
styles.css                  → tema de submarino futurista + juguete acuático
game3d.js                   → Three.js, gameplay, niveles, audio, Firebase y bucle físico
vendor/three.module.js      → runtime local de Three.js 0.160.0
vendor/rapier.mjs           → runtime WASM local de Rapier 3D 0.20.0
vendor/rapier-physics.js    → adaptador ligero de cuerpos y colliders Rapier
vendor/RAPIER-LICENSE       → licencia Apache-2.0 de Rapier
vendor/THREE-LICENSE        → licencia MIT de Three.js
```

`vendor/rapier-physics.js` expone vectores mutables, colliders compuestos, masas, fuerzas, torques e impulsos directos sobre los `RigidBody` de Rapier. Las fuerzas y torques se reinician explícitamente después de cada integración, porque la API nativa de Rapier los conserva entre pasos. Los cuerpos dinámicos nunca reciben una posición o quaternion manual para resolver contactos; solo los fixtures fijos que se mueven sincronizan su estado.

## Persistencia y Firebase

El progreso y el ranking local funcionan sin configuración. La integración opcional de Firebase conserva autenticación anónima, progreso y ranking global. Si Firebase no está disponible, la interfaz pasa a modo **Solo local** sin bloquear la partida.

Para conectar otro proyecto, sustituye `FIREBASE_CONFIG` en `game3d.js` y habilita Authentication anónima y Firestore.

## Validación de la BUILD R21

```text
node --check game3d.js
node --check vendor/rapier-physics.js
git diff --check
Preview HTTP 200
Prueba Rapier de fuerza por paso, guard superior bajo y breakaway asentado
Prueba aislada de contactos, apilado y masa 4.5x Rapier
```

## Licencia

El proyecto se distribuye bajo la licencia indicada en [LICENSE](LICENSE). Rapier y Three.js conservan sus licencias en `vendor/`.

## Créditos

**Creado por:** [orochi_iory](https://github.com/orochi-iory)

**Desarrollado con:** asistencia de IA, Three.js y Rapier.
