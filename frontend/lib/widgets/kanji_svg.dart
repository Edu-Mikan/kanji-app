import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';
import '../config/app_config.dart';

class KanjiSvg extends StatelessWidget {
  final String kanji;
  final double size;
  final double opacity;

  const KanjiSvg({
    super.key,
    required this.kanji,
    this.size = 200,
    this.opacity = 0.2,
  });

  String _kanjiToSvgFileName(String kanji) {
    final code = kanji.runes.first;
    return code.toRadixString(16).padLeft(5, '0');
  }

  @override
  Widget build(BuildContext context) {
    final fileName = _kanjiToSvgFileName(kanji);
    final url = "${AppConfig.baseUrl}/kanji_svg/$fileName.svg";
    return Opacity(
      opacity: opacity,
      child: SizedBox(
        width: size,
        height: size,
        child: SvgPicture.network(
          url,
          fit: BoxFit.contain,

          // ✅ opcional: placeholder mientras carga
          placeholderBuilder: (context) =>
              const Center(child: CircularProgressIndicator(strokeWidth: 2)),
        ),
      ),
    );
  }
}
