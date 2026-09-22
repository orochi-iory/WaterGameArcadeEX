# 💧 Water Game Arcade EX · 3D

<div align="center">

![Water Game Arcade EX](https://img.shields.io/badge/Water_Game-Arcade_EX-blue?style=for-the-badge)
![Three.js](https://img.shields.io/badge/Three.js-0.160-black?style=for-the-badge&logo=threedotjs)
![WebGL](https://img.shields.io/badge/WebGL-2.0-orange?style=for-the-badge)

**El clásico juguete de aros acuáticos, convertido en una experiencia 3D para navegador.**

</div>

---

## ✨ Qué cambió

Water Game Arcade EX ya no es un canvas 2D: el tablero completo se renderiza con **Three.js y WebGL** dentro de una carcasa arcade responsive.

- 🌊 Agua con superficie animada, volumen, burbujas, reflejos y niebla.
- 💍 Aros como mallas 3D reales, con volumen, materiales, brillo y rotación libre.
- 🪄 Palos, soportes, luces, balizas y etiquetas de capacidad en el espacio 3D.
- 💨 Chorros con oscilación, gotas, burbujas y fuerzas físicas, sin flechas visuales rígidas.
- ⚙️ Física 3D con cuerpos rígidos Rapier: gravedad, flotación, drag, orientación, velocidad angular y colisiones de geometría real.
- 🎯 Enceste con captura física suave: el contacto del diámetro interior guía el aro sin teletransporte ni captura por roce exterior.
- 🎮 Diez niveles: cinco clásicos y cinco niveles con requisitos de color.
- 🔥 Combos, bonus de tiempo, bonus de color perfecto y aros pesados al quedar ensartados.
- 📱 Controles táctiles, teclado, giroscopio, vibración y pantalla completa.
- 👁️ Cinco paletas accesibles con contrastes de color diferenciados.
- 💾 Ranking local y sincronización global opcional con Firebase.
- 🔊 Audio procedural para chorros, combos, salidas físicas, victoria y una melodía ambiental submarina variable por nivel.

## 🎯 Cómo jugar

Ensarta los **20 aros** en los tres palos. Para completar un nivel necesitas al menos **5 aros en cada palo**. En los niveles 6–10, cada palo también pide una cantidad mínima de un color concreto.

| Acción | Teclado | Pantalla táctil | Mando |
| --- | --- | --- | --- |
| Chorro izquierdo | `A` | Botón rojo | Botón frontal 1 |
| Chorro central | `S` | Botón verde | Botón frontal 2 |
| Chorro derecho | `D` | Botón azul | Botón frontal 3 |
| Inclinar izquierda/derecha | `←` / `→` | Botones laterales | Cruceta / stick izquierdo |
| Mover arriba/abajo | `↑` / `↓` | Botones dorados | Cruceta / stick izquierdo |
| Reiniciar | `R` | `↺` | — |
| Menú | — | `☰` | — |

El juego usa una configuración de volumen estrecho: los aros y los palos comparten el espacio X/Y, mientras Z conserva el grosor real necesario para resolver contactos. Mueve los aros en X/Y y haz que el diámetro interior toque la punta del palo; la captura solo se arma dentro del agujero, nunca por roces exteriores. Una vez ensartados pesan aproximadamente 3,25x más para que la inclinación continua no los levante con facilidad. La salida de los aros depende de la física Rapier y de impulsos físicos, no de teletransportes.

## 🏆 Puntuación

- Aro base: **100 puntos**.
- Combo x2, x3, x4…: multiplica los puntos del siguiente aro del mismo color.
- Cinco aros del mismo color en un palo: **+500**.
- Dos combos de color en un palo: **+1500**.
- Bonus de tiempo: hasta **+2000**.
- Requisitos de color de los niveles 6–10: bonus adicional.

## ▶️ Ejecutar

Es un proyecto estático. No hay bundler ni instalación obligatoria: Three.js y Rapier están incluidos localmente como módulos ES en `vendor/`, por lo que el juego puede arrancar aunque el CDN esté bloqueado.

```bash
# Opción recomendada
python3 -m http.server 8080

# después abre http://localhost:8080
```

También puedes usar cualquier servidor estático compatible con módulos ES. Abrir `index.html` directamente con `file://` puede bloquear los imports por las políticas CORS del navegador.

## ☁️ Firebase opcional

El ranking funciona en local sin configuración adicional. El archivo `game3d.js` conserva la integración opcional con Firebase para autenticación anónima, progreso y ranking global. Si Firebase no está disponible, la interfaz cambia automáticamente a **Solo local** sin impedir jugar.

Para usar otro proyecto, sustituye `FIREBASE_CONFIG` en `game3d.js` y habilita:

1. Authentication → Anonymous.
2. Firestore Database.
3. Lectura pública del leaderboard y escritura autenticada para usuarios anónimos.

## 🧱 Arquitectura

```text
index.html          → carcasa arcade, HUD, menús, tutorial y controles
styles.css          → diseño responsive, overlays y estética de hardware acuático
game3d.js           → escena Three.js, física Rapier, audio, persistencia y Firebase opcional
vendor/three.module.js → runtime local de Three.js 0.160.0
vendor/rapier.mjs      → runtime local WASM de Rapier 3D 0.20.0
vendor/rapier-physics.js → adaptador de cuerpos, colliders y fuerzas para el juego
vendor/RAPIER-LICENSE   → licencia Apache-2.0 de Rapier
vendor/THREE-LICENSE   → licencia MIT de Three.js
```

La escena utiliza materiales y geometría procedurales, por lo que no necesita modelos 3D ni imágenes externas. El canvas WebGL se adapta al tamaño real de la pantalla del juguete mediante `ResizeObserver`.

## ♿ Accesibilidad

Desde **Accesibilidad** puedes cambiar entre Normal, Deuteranopia, Protanopia, Tritanopia y Alto contraste. Cada aro incluye además una forma visual: círculo, cuadrado, triángulo o rombo.

## 📱 Giroscopio

En un dispositivo compatible:

1. Pulsa **Activar giroscopio** desde el menú.
2. Mantén el teléfono en tu posición de juego.
3. Toca **GYRO ⊙** para calibrar el centro.

## 📜 Licencia

El proyecto se distribuye bajo la licencia indicada en [LICENSE](LICENSE).

## 👤 Créditos

**Creado por:** [orochi_iory](https://github.com/orochi-iory)

**Desarrollado con:** asistencia de IA y Three.js.
