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
  bool cargando = true;

  @override
  void initState() {
    super.initState();
    cargarCategorias();
  }

  Future<void> cargarCategorias() async {
    try {
      final jsonString = await rootBundle.loadString(
        'assets/data/training_kanji.json',
      );

      final data = jsonDecode(jsonString);

      if (!mounted) return;

      setState(() {
        categories = data['categories'] ?? [];
        cargando = false;
      });
    } catch (_) {
      if (!mounted) return;

      setState(() {
        categories = [];
        cargando = false;
      });
    }
  }

  bool _isDesktopWidth(double screenWidth) {
    return screenWidth >= 900;
  }

  double _getContentMaxWidth(double screenWidth) {
    if (_isDesktopWidth(screenWidth)) {
      return 760;
    }

    return screenWidth;
  }

  EdgeInsets _getListPadding(double screenWidth) {
    if (_isDesktopWidth(screenWidth)) {
      return const EdgeInsets.fromLTRB(24, 24, 24, 32);
    }

    return const EdgeInsets.all(16);
  }

  void _openCategory({required String title, required List<String> kanjis}) {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => TrainingKanjiListScreen(title: title, kanjis: kanjis),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Entrenamiento IA')),
      body: _buildBody(),
    );
  }

  Widget _buildBody() {
    if (cargando) {
      return const Center(child: CircularProgressIndicator());
    }

    if (categories.isEmpty) {
      return _buildCenteredMessage(
        'No hay categorías de entrenamiento disponibles',
      );
    }

    return SafeArea(
      child: LayoutBuilder(
        builder: (context, constraints) {
          final screenWidth = constraints.maxWidth;
          final contentMaxWidth = _getContentMaxWidth(screenWidth);
          final listPadding = _getListPadding(screenWidth);
          final isDesktop = _isDesktopWidth(screenWidth);

          return ListView.builder(
            padding: listPadding,
            itemCount: categories.length,
            itemBuilder: (context, index) {
              final category = categories[index];
              final title = category['name']?.toString() ?? '';
              final description = category['description']?.toString() ?? '';
              final kanjis = List<String>.from(category['kanjis'] ?? []);

              final card = _buildCategoryCard(
                title: title,
                description: description,
                kanjis: kanjis,
              );

              if (!isDesktop) {
                return card;
              }

              return Center(
                child: ConstrainedBox(
                  constraints: BoxConstraints(maxWidth: contentMaxWidth),
                  child: card,
                ),
              );
            },
          );
        },
      ),
    );
  }

  Widget _buildCenteredMessage(String message) {
    return SafeArea(
      child: LayoutBuilder(
        builder: (context, constraints) {
          final screenWidth = constraints.maxWidth;
          final contentMaxWidth = _getContentMaxWidth(screenWidth);
          final isDesktop = _isDesktopWidth(screenWidth);

          final messageWidget = Padding(
            padding: const EdgeInsets.all(24),
            child: Text(
              message,
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 18),
            ),
          );

          if (!isDesktop) {
            return Center(child: messageWidget);
          }

          return Center(
            child: ConstrainedBox(
              constraints: BoxConstraints(maxWidth: contentMaxWidth),
              child: messageWidget,
            ),
          );
        },
      ),
    );
  }

  Widget _buildCategoryCard({
    required String title,
    required String description,
    required List<String> kanjis,
  }) {
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: ListTile(
        title: Text(title),
        subtitle: Text('$description\n${kanjis.length} kanjis'),
        trailing: const Icon(Icons.chevron_right),
        onTap: () {
          _openCategory(title: title, kanjis: kanjis);
        },
      ),
    );
  }
}
