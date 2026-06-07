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
        padding: const EdgeInsets.symmetric(horizontal: 0),
        child: SizedBox(
          height: 48,
          child: Stack(
            clipBehavior: Clip.none,
            alignment: Alignment.center,
            children: [
              Transform.translate(
                offset: const Offset(0, -2),
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
                              fontSize: 36,
                              //fontSize: 11, // prueba 9–11
                              //height: 1.0, // muy importante
                              //decoration: TextDecoration.underline,
                            )
                          : AppTextStyles.jpLarge.copyWith(
                              //color: Colors.red,
                              fontSize: 36,
                              //fontSize: 11, // prueba 9–11
                              //height: 1.0, // muy importante
                              //decoration: TextDecoration.underline,
                            ),
                    );
                  }),
                ),
              ),
              Positioned(
                top: -12,
                child: Text(
                  reading,
                  style: AppTextStyles.furigana.copyWith(
                    fontSize: 11.5,
                    height: 1.0,
                  ),
                  textHeightBehavior: const TextHeightBehavior(
                    applyHeightToFirstAscent: false,
                    applyHeightToLastDescent: false,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
