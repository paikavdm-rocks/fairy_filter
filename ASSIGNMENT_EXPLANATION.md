# The Emerald Kingdom - Refined Assignment

This project has been upgraded to the **Emerald Kingdom** theme, introducing advanced client-side processing while maintaining the core "Firebase as a Service" assignment goals.

## New Feature Highlights:

1.  **Generative Client-Side Environment**:
    - The background is no longer a static color. It now uses a custom p5.js loop to generate a **Mossy Forest** with shifting misty shapes and interactive fireflies.
    - This demonstrates advanced "Client-Side" logic: the server doesn't know about the fireflies; they are generated in real-time by the user's browser.

2.  **Magic Selfie Stickers (Data Persistence)**:
    - You can now click "Capture Magic Selfie" to take a webcam snapshot.
    - **Concept**: This uses the `capture.toDataURL()` method to convert pixels into a string.
    - **Persistence**: This string is sent to **Firestore**. When you or anyone else loads the scene, the "Server" (Firebase) sends that string back, and p5.js recreates your sticker in the "Emerald Chronicles" (Gallery).

3.  **Refined Aesthetics**:
    - **Typography**: Switched to 'Playfair Display' (for a classical, ancient lore feel) and 'Inter' (for modern UI readability).
    - **Color Palette**: Deep Emerald (#1A2A22), Neon Green (#50FA7B), and Sunlight Gold (#F1FA8C).

## How to use:
1.  **Login**: Enter the realm with your magical credentials.
2.  **Create**: Use the Magic Elements (🧚, 🍄, 🪄) or "Capture Magic Selfie" to populate your forest.
3.  **Arrange**: Drag stickers around. Press **Delete** while hovering to remove an item.
4.  **Chronicle**: Write the "Lore" of your scene and click "COMMIT TO ETERNITY" to save it to Firebase for the whole class to see.
