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
- 💍 Aros como mallas 3D reales, con volumen, materiales, brillo, glyphs y rotación.
- 🪄 Palos, soportes, luces, balizas y etiquetas de capacidad en el espacio 3D.
- 💨 Chorros con conos de agua, oscilación, partículas y fuerzas físicas.
- ⚙️ Física personalizada 2.5D: gravedad, flotación, inclinación, impulsos, colisiones y tensión.
- 🎮 Diez niveles: cinco clásicos y cinco niveles con requisitos de color.
- 🔥 Combos, bonus de tiempo, bonus de color perfecto y expulsión por tensión.
- 📱 Controles táctiles, teclado, giroscopio, vibración y pantalla completa.
- 👁️ Cinco paletas accesibles con formas para diferenciar los colores.
- 💾 Ranking local y sincronización global opcional con Firebase.
- 🔊 Audio procedural para chorros, combos, tensión, victoria y música ambiental.

## 🎯 Cómo jugar

Ensarta los **20 aros** en los tres palos. Para completar un nivel necesitas al menos **5 aros en cada palo**. En los niveles 6–10, cada palo también pide una cantidad mínima de un color concreto.

| Acción | Teclado | Pantalla táctil |
| --- | --- | --- |
| Chorro izquierdo | `A` | Botón rojo |
| Chorro central | `S` | Botón verde |
| Chorro derecho | `D` | Botón azul |
| Inclinar izquierda/derecha | `←` / `→` | Botones laterales |
| Inclinar arriba/abajo | `↑` / `↓` | Botones dorados |
| Reiniciar | `R` | `↺` |
| Menú | — | `☰` |

Mantener un chorro cerca de un palo durante demasiado tiempo aumenta la tensión. Los aros superiores vibran primero y el palo se ilumina en rojo antes de expulsarlos.

## 🏆 Puntuación

- Aro base: **100 puntos**.
- Combo x2, x3, x4…: multiplica los puntos del siguiente aro del mismo color.
- Cinco aros del mismo color en un palo: **+500**.
- Dos combos de color en un palo: **+1500**.
- Bonus de tiempo: hasta **+2000**.
- Requisitos de color de los niveles 6–10: bonus adicional.

## ▶️ Ejecutar

Es un proyecto estático. No hay bundler ni instalación obligatoria: Three.js se carga desde CDN como módulo ES.

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
index.html   → carcasa arcade, HUD, menús, tutorial y controles
styles.css   → diseño responsive, overlays y estética de hardware acuático
game3d.js    → escena Three.js, física, audio, persistencia y Firebase opcional
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
