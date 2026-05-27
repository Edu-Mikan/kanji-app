import 'package:flutter/material.dart';
import 'package:kanji_app/styles/app_text_styles.dart';

class FuriganaText extends StatelessWidget {
  final String text;
  final String reading;
  final int? indiceActivo;

  const FuriganaText({
    super.key,
    required this.text,
    required this.reading,
    this.indiceActivo,
  });

  int _getIndiceVisual() {
    if (indiceActivo == null) return -1;

    int count = 0;

    for (int i = 0; i < text.length; i++) {
      if (text[i] == "〇") {
        if (count == indiceActivo) return i;
        count++;
      }
    }

    return -1;
  }

  @override
  Widget build(BuildContext context) {
    return IntrinsicWidth(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 1),
        child: SizedBox(
          height: 48,
          child: Stack(
            clipBehavior: Clip.none,
            alignment: Alignment.center,
            children: [
              Transform.translate(
                offset: const Offset(0, -3),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: List.generate(text.length, (i) {
                    final char = text[i];

                    final esActivo =
                        indiceActivo != null &&
                        char == "〇" &&
                        i == _getIndiceVisual();

                    return Text(
                      char,
                      style: esActivo
                          ? AppTextStyles.jpLarge.copyWith(
                              color: Colors.red,
                              //decoration: TextDecoration.underline,
                            )
                          : AppTextStyles.jpLarge,
                    );
                  }),
                ),
              ),
              Positioned(
                top: -16,
                child: Text(reading, style: AppTextStyles.furigana),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
