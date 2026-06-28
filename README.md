# 💧 Water Game Arcade EX

<div align="center">

![Water Game Arcade EX](https://img.shields.io/badge/Water_Game-Arcade_EX-blue?style=for-the-badge&logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHBhdGggZmlsbD0id2hpdGUiIGQ9Ik0xMiwyQTEwLDEwIDAgMCwwIDIsMTJBMTAsMTAgMCAwLDAgMTIsMjJBMTAsMTAgMCAwLDAgMjIsMTJBMTAsMTAgMCAwLDAgMTIsMloiLz48L3N2Zz4=)
![Versión](https://img.shields.io/badge/versión-2.0-green?style=for-the-badge)
![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)
![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=for-the-badge&logo=css3&logoColor=white)

**El clásico juguete de aros acuáticos, ahora en tu pantalla**

[🎮 Jugar Ahora](#instalación) · [📖 Tutorial](#cómo-jugar) · [🤝 Contribuir](#contribuir)

</div>

---

## 📋 Descripción

**Water Game Arcade EX** es una recreación digital del clásico juguete de agua con aros que todos recordamos de nuestra infancia. Usa chorros de agua para impulsar los aros de colores y ensártarlos en los palos. 

Desarrollado completamente en **HTML5, CSS3 y JavaScript vanilla** - sin dependencias externas. Funciona en cualquier navegador moderno, tanto en ordenador como en dispositivos móviles.

### ✨ Características principales

- 🎮 **5 niveles de dificultad** - Desde el clásico hasta el caos con palos móviles
- 📱 **Controles táctiles y giroscopio** - Inclina tu dispositivo para guiar los aros
- 🎨 **5 paletas de accesibilidad** - Incluyendo modos para daltonismo
- 🔥 **Sistema de combos** - Encadena colores para multiplicar puntos
- 🌈 **Bonus de color perfecto** - 5+ aros del mismo color = +500 puntos
- ⏱️ **Bonus de tiempo** - Cuanto más rápido, más puntos
- 🔊 **Efectos de sonido** - Audio generado proceduralmente
- 📳 **Retroalimentación háptica** - Vibración en dispositivos compatibles
- 💾 **Puntuaciones locales** - Guarda tus mejores resultados
- 📤 **Compartir resultados** - Comparte tu puntuación con amigos

---

## 🎯 Cómo Jugar

### Objetivo
Ensarta los **20 aros** en los 3 palos. Cada palo necesita un **mínimo de 5 aros** para poder completar el nivel.

### Controles

| Acción | Teclado | Móvil |
|--------|---------|-------|
| Chorro izquierdo | `A` | Botón rojo 💨 |
| Chorro central | `S` | Botón verde 💨 |
| Chorro derecho | `D` | Botón azul 💨 |
| Inclinar izquierda | `←` | Inclinar dispositivo |
| Inclinar derecha | `→` | Inclinar dispositivo |
| Inclinar arriba | `↑` | Inclinar dispositivo |
| Inclinar abajo | `↓` | Inclinar dispositivo |
| Reiniciar nivel | `R` | Botón ↺ |

### Indicadores de los Palos

Encima de cada palo verás números que indican su estado:

- **`3/5`** (naranja) → Necesitas 5 mínimo, te faltan 2
- **`6/8`** (verde) → Ya tienes el mínimo, caben hasta 8
- **`✓8`** (verde brillante) → ¡Palo completamente lleno!

### Sistema de Puntuación

| Tipo | Puntos |
|------|--------|
| Aro base | 100 pts |
| Combo x2 | 200 pts |
| Combo x3 | 300 pts |
| Combo x4 | 400 pts |
| Combo x5 | 500 pts |
| Color perfecto (5+ mismo color en palo) | +500 pts |
| Bonus tiempo (<2 min) | +2000 pts |
| Bonus tiempo (<3 min) | +1500 pts |
| Bonus tiempo (<5 min) | +1000 pts |
| Bonus tiempo (<10 min) | +500 pts |

### Sistema de Tensión ⚠️

Los aros ensartados pueden caerse si hay demasiada tensión:

- 💨 **Chorros cercanos** generan tensión leve
- 📐 **Inclinación excesiva** genera tensión
- ⏱️ **Mantener un chorro activo** mucho tiempo aumenta la tensión
- 🔝 **El aro de la punta** es el más inestable y cae primero

Cuando hay tensión:
1. Los aros empiezan a **vibrar** como advertencia
2. Si continúas, el aro superior **se cae**
3. El palo se pone **ROJO** temporalmente y no acepta aros
4. ¡Tensión máxima = **TODOS los aros fuera**!

---

## 🎮 Niveles

| Nivel | Nombre | Descripción |
|-------|--------|-------------|
| 1 | **Clásico** | 3 palos estáticos de diferentes alturas |
| 2 | **Alturas** | Palos a diferentes elevaciones |
| 3 | **Escalera** | Palos en formación escalonada |
| 4 | **Movimiento** | Un palo se mueve lateralmente |
| 5 | **Caos** | ¡Todos los palos se mueven! |

---

## 🛠️ Instalación

### Opción 1: Jugar directamente
Simplemente abre el archivo `index.html` en cualquier navegador moderno.

### Opción 2: Servidor local
```bash
# Clona el repositorio
git clone https://github.com/tu-usuario/water-game-arcade-ex.git

# Entra en el directorio
cd water-game-arcade-ex

# Opción A: Python 3
python -m http.server 8080

# Opción B: Node.js
npx serve

# Opción C: PHP
php -S localhost:8080
```

Luego abre `http://localhost:8080` en tu navegador.

### Opción 3: PWA (Progressive Web App)
En dispositivos móviles, puedes "instalar" el juego:
- **Android**: Menú del navegador → "Añadir a pantalla de inicio"
- **iOS**: Botón compartir → "Añadir a pantalla de inicio"

---

## ♿ Accesibilidad

El juego incluye **5 paletas de colores** diseñadas para diferentes tipos de visión:

| Paleta | Descripción |
|--------|-------------|
| **Normal** | Colores estándar optimizados |
| **Deuteranopia** | Para ceguera rojo-verde |
| **Protanopia** | Para ceguera al rojo |
| **Tritanopia** | Para ceguera azul-amarillo |
| **Alto Contraste** | Máxima diferenciación |

Además, cada color tiene una **forma única** (●, ■, ▲, ◆) para facilitar la identificación sin depender del color.

---

## 📐 Calibración del Giroscopio

En dispositivos móviles con giroscopio:

1. El indicador **GYRO ⊙** aparece en la esquina superior izquierda
2. Sostén el dispositivo en tu posición cómoda de juego
3. **Toca el indicador** para establecer esa posición como "centro neutro"
4. Ahora los movimientos desde esa posición inclinarán los aros
5. Puedes recalibrar en cualquier momento tocando de nuevo

---

## 🏗️ Arquitectura Técnica

```
index.html (archivo único)
├── HTML5 - Estructura y UI
├── CSS3 - Estilos y animaciones
│   ├── Variables CSS para temas
│   ├── Animaciones @keyframes
│   └── Media queries responsive
└── JavaScript - Lógica del juego
    ├── Motor de física 2D
    ├── Sistema de partículas
    ├── Audio procedural (Web Audio API)
    ├── Gestión de estados
    ├── LocalStorage para puntuaciones
    └── DeviceOrientation API (giroscopio)
```

### Características técnicas

- **Sin dependencias** - Todo en un solo archivo HTML
- **Canvas 2D** - Renderizado eficiente a 60 FPS
- **Física personalizada** - Gravedad, flotación, colisiones
- **Audio procedural** - Tonos generados con Web Audio API
- **Responsive** - Se adapta a cualquier tamaño de pantalla
- **Touch optimizado** - Gestos táctiles sin delay

---

## 🔥 Configuración de Firebase (Puntuaciones Online)

El juego incluye soporte para **puntuaciones globales** usando Firebase Firestore. Para habilitarlo:

### Paso 1: Crear proyecto en Firebase

1. Ve a [Firebase Console](https://console.firebase.google.com/)
2. Crea un nuevo proyecto
3. En "Build" → "Firestore Database", crea una base de datos
4. Selecciona "Start in **test mode**" (para desarrollo)

### Paso 2: Obtener configuración

1. En la configuración del proyecto (⚙️), ve a "General"
2. En "Tus apps", añade una app web (icono `</>`)
3. Copia el objeto `firebaseConfig`

### Paso 3: Configurar en el juego

El juego ya viene configurado con Firebase. Si quieres usar tu propio proyecto, abre `index.html` y busca `FIREBASE_CONFIG`:

```javascript
const FIREBASE_CONFIG = {
  apiKey: "TU_API_KEY",
  authDomain: "tu-proyecto.firebaseapp.com",
  projectId: "tu-proyecto",
  storageBucket: "tu-proyecto.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef"
};
```

### Paso 4: Habilitar Auth Anónimo

1. En Firebase Console → **Authentication** → **Sign-in method**
2. Habilita **"Anonymous"** (Anónimo)
3. ¡Listo! Los usuarios se autentican automáticamente sin registro

### Paso 5: Reglas de Firestore (Producción)

Para producción, configura reglas más seguras en Firestore:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /leaderboard/{document} {
      allow read: if true;
      allow create: if request.auth != null
                    && request.resource.data.score is number
                    && request.resource.data.score > 0
                    && request.resource.data.name is string
                    && request.resource.data.name.size() <= 15;
      allow update, delete: if false;
    }
    match /users/{userId} {
      allow read: if request.auth != null && request.auth.uid == userId;
      allow write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

### Sistema de usuarios

El juego usa **autenticación anónima** de Firebase:

- 🆔 Cada dispositivo recibe un **ID único** automáticamente
- ☁️ El progreso (niveles desbloqueados) se **guarda en la nube**
- 📱 Si juegas en otro dispositivo con la misma cuenta, recuperas tu progreso
- 🏆 Las puntuaciones globales se vinculan a tu usuario

### Sin Firebase

Si no configuras Firebase, el juego funciona perfectamente con **puntuaciones locales** guardadas en el navegador.

---

## 🤝 Contribuir

¡Las contribuciones son bienvenidas! 

1. Haz fork del proyecto
2. Crea una rama para tu feature (`git checkout -b feature/nueva-caracteristica`)
3. Commit de tus cambios (`git commit -m 'Añade nueva característica'`)
4. Push a la rama (`git push origin feature/nueva-caracteristica`)
5. Abre un Pull Request

### Ideas para contribuir

- [x] ~~Sistema de puntuaciones online (Firebase)~~ ✅
- [ ] Nuevos niveles y desafíos
- [ ] Más modos de juego
- [ ] Logros y achievements
- [ ] Modo multijugador local
- [ ] Temas visuales adicionales
- [ ] Soporte para más idiomas

---

## 📜 Licencia

Este proyecto está bajo la licencia MIT. Ver el archivo [LICENSE](LICENSE) para más detalles.

---

## 👤 Créditos

**Creado por:** [orochi_iory](https://github.com/orochi_iory)

**Desarrollado con:** 🤖 Asistencia de IA

---

<div align="center">

### ⭐ Si te gusta el proyecto, ¡dale una estrella!

**[🎮 Jugar Water Game Arcade EX](#instalación)**

</div>
