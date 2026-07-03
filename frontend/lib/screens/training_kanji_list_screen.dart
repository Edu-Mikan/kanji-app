import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'test_screen.dart';

class TrainingKanjiListScreen extends StatefulWidget {
  const TrainingKanjiListScreen({super.key});

  @override
  State<TrainingKanjiListScreen> createState() =>
      _TrainingKanjiListScreenState();
}

class _TrainingKanjiListScreenState extends State<TrainingKanjiListScreen> {
  List<String> kanjis = [];

  @override
  void initState() {
    super.initState();
    cargarKanjis();
  }

  Future<void> cargarKanjis() async {
    final jsonString = await rootBundle.loadString(
      'assets/data/training_kanji.json',
    );

    final data = jsonDecode(jsonString);

    setState(() {
      kanjis = List<String>.from(data['kanjis']);
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Entrenamiento IA')),
      body: kanjis.isEmpty
          ? const Center(child: CircularProgressIndicator())
          : GridView.builder(
              padding: const EdgeInsets.all(16),
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 4,
                crossAxisSpacing: 12,
                mainAxisSpacing: 12,
              ),
              itemCount: kanjis.length,
              itemBuilder: (context, index) {
                final kanji = kanjis[index];

                return InkWell(
                  onTap: () {
                    Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (_) =>
                            TestScreen(kanjiList: kanjis, initialIndex: index),
                      ),
                    );
                  },
                  child: Card(
                    elevation: 3,
                    child: Center(
                      child: Text(
                        kanji,
                        style: const TextStyle(
                          fontSize: 36,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                  ),
                );
              },
            ),
    );
  }
}
