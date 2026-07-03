import 'package:flutter/material.dart';
import 'test_screen.dart';

class TrainingKanjiListScreen extends StatefulWidget {
  final String title;
  final List<String> kanjis;

  const TrainingKanjiListScreen({
    super.key,
    required this.title,
    required this.kanjis,
  });

  @override
  State<TrainingKanjiListScreen> createState() =>
      _TrainingKanjiListScreenState();
}

class _TrainingKanjiListScreenState extends State<TrainingKanjiListScreen> {
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(widget.title)),
      body: widget.kanjis.isEmpty
          ? const Center(child: CircularProgressIndicator())
          : GridView.builder(
              padding: const EdgeInsets.all(16),
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 5,
                crossAxisSpacing: 12,
                mainAxisSpacing: 12,
              ),
              itemCount: widget.kanjis.length,
              itemBuilder: (context, index) {
                final kanji = widget.kanjis[index];

                return InkWell(
                  onTap: () {
                    Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (_) => TestScreen(
                          kanjiList: widget.kanjis,
                          initialIndex: index,
                        ),
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
