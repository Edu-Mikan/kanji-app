import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'training_kanji_list_screen.dart';

class TrainingCategoryScreen extends StatefulWidget {
  const TrainingCategoryScreen({super.key});

  @override
  State<TrainingCategoryScreen> createState() => _TrainingCategoryScreenState();
}

class _TrainingCategoryScreenState extends State<TrainingCategoryScreen> {
  List<dynamic> categories = [];

  @override
  void initState() {
    super.initState();
    cargarCategorias();
  }

  Future<void> cargarCategorias() async {
    final jsonString = await rootBundle.loadString(
      'assets/data/training_kanji.json',
    );

    final data = jsonDecode(jsonString);

    setState(() {
      categories = data['categories'] ?? [];
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Entrenamiento IA')),
      body: categories.isEmpty
          ? const Center(child: CircularProgressIndicator())
          : ListView.builder(
              padding: const EdgeInsets.all(16),
              itemCount: categories.length,
              itemBuilder: (context, index) {
                final category = categories[index];

                final title = category['name'] ?? '';

                final description = category['description'] ?? '';

                final kanjis = List<String>.from(category['kanjis'] ?? []);

                return Card(
                  margin: const EdgeInsets.only(bottom: 12),
                  child: ListTile(
                    title: Text(title),
                    subtitle: Text('$description\n${kanjis.length} kanjis'),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () {
                      Navigator.push(
                        context,
                        MaterialPageRoute(
                          builder: (_) => TrainingKanjiListScreen(
                            title: title,
                            kanjis: kanjis,
                          ),
                        ),
                      );
                    },
                  ),
                );
              },
            ),
    );
  }
}
