import 'package:flutter/material.dart';
import '../widgets/drawing_canvas.dart';

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Kanji App')),
      body: Column(
        children: const [
          SizedBox(height: 20),
          Text('Escribe el kanji aquí'),
          SizedBox(height: 10),
          DrawingCanvas(),
        ],
      ),
    );
  }
}