# Fairy Dollhouse Assignment

This project has been "stripped down" to focus precisely on the core concepts of this week's assignment: **Client-side vs Server-side (Firebase as a Service)**.

## How it fits the assignment:

1.  **Client vs Server**: 
    - The **Client** (your browser) runs the p5.js canvas and handles user interactions (dragging fairies, clicking mushrooms).
    - The **Server** (Firebase Firestore) acts as your "GUI for the backend". You don't write any server-side code; instead, you use the Firebase console to see your data and "pull the strings" with client-side JavaScript.
    
2.  **Persistence (Firestore)**:
    - When you click "Save Scene", your arrangement (the X/Y positions of every emoji) is packaged as a JSON object and sent to the **Firestore** database.
    - Refresh the page, and the data is still there in the cloud!
    
3.  **Scene Description**:
    - There is a text box specifically to "record and recall a description of the scene," allowing you to narrate your digital dollhouse.
    
4.  **Firebase Authentication**:
    - Users must log in (or sign up automatically by entering an email/pass) to save scenes.
    - Your user status is tracked by the "server" (Auth service) without you building a login system from scratch.
    
5.  **Social Sharing**:
    - The **Gallery** section at the bottom uses a real-time listener (`onSnapshot`). This means whenever *anyone* in the class saves a scene, it pops up in the gallery for everyone else immediately.
    - You can click any scene in the gallery to "recall" it into your own canvas!

## Technology Used:
- **p5.js**: Interactive visual dollhouse.
- **Firebase v10 (Modular)**: State-of-the-art serverless SDK.
- **Vanilla CSS**: Premium "Magic" aesthetics (Glassmorphism, gradients, animations).

## To run:
Simply open `index.html` in a Live Server or any browser!
