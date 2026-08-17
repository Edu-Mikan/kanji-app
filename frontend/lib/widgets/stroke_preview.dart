import 'package:flutter/material.dart';
import 'package:kanji_app/models/review_sample.dart';

class StrokePreview extends StatelessWidget {
  final List<ReviewStroke> strokes;
  final double size;
  final Color strokeColor;
  final Color backgroundColor;
  final Color guideColor;
  final double strokeWidth;
  final bool showGuides;
  final String? semanticsLabel;
  final bool showStrokeOrder;

  const StrokePreview({
    super.key,
    required this.strokes,
    this.size = 180,
    this.strokeColor = Colors.black,
    this.backgroundColor = Colors.white,
    this.guideColor = const Color(0xFFBDBDBD),
    this.strokeWidth = 5,
    this.showGuides = true,
    this.semanticsLabel,
    this.showStrokeOrder = false,
  });

  List<ReviewStroke> get validStrokes {
    return List<ReviewStroke>.unmodifiable(
      strokes.where((stroke) => stroke.isValid),
    );
  }

  @override
  Widget build(BuildContext context) {
    final previewStrokes = validStrokes;

    return Semantics(
      label:
          semanticsLabel ??
          'Vista previa de una muestra con '
              '${previewStrokes.length} trazos',
      image: true,
      child: SizedBox.square(
        dimension: size,
        child: ClipRRect(
          borderRadius: BorderRadius.circular(12),
          child: DecoratedBox(
            decoration: BoxDecoration(
              color: backgroundColor,
              border: Border.all(color: Colors.black.withValues(alpha: 0.12)),
              borderRadius: BorderRadius.circular(12),
            ),
            child: CustomPaint(
              painter: StrokePreviewPainter(
                strokes: previewStrokes,
                strokeColor: strokeColor,
                backgroundColor: backgroundColor,
                guideColor: guideColor,
                strokeWidth: strokeWidth,
                showGuides: showGuides,
                showStrokeOrder: showStrokeOrder,
              ),
              child: previewStrokes.isEmpty
                  ? const Center(
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(
                            Icons.gesture_outlined,
                            color: Colors.grey,
                            size: 32,
                          ),
                          SizedBox(height: 8),
                          Text(
                            'Sin trazos',
                            style: TextStyle(color: Colors.grey, fontSize: 13),
                          ),
                        ],
                      ),
                    )
                  : null,
            ),
          ),
        ),
      ),
    );
  }
}

class StrokePreviewPainter extends CustomPainter {
  final List<ReviewStroke> strokes;
  final Color strokeColor;
  final Color backgroundColor;
  final Color guideColor;
  final double strokeWidth;
  final bool showGuides;
  final double padding;
  final bool showStrokeOrder;

  const StrokePreviewPainter({
    required this.strokes,
    required this.strokeColor,
    required this.backgroundColor,
    required this.guideColor,
    required this.strokeWidth,
    required this.showGuides,
    required this.showStrokeOrder,
    this.padding = 14,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final backgroundPaint = Paint()..color = backgroundColor;

    canvas.drawRect(Offset.zero & size, backgroundPaint);

    if (showGuides) {
      _drawGuides(canvas, size);
    }

    if (strokes.isEmpty) {
      return;
    }

    final drawableWidth = (size.width - padding * 2).clamp(
      0.0,
      double.infinity,
    );

    final drawableHeight = (size.height - padding * 2).clamp(
      0.0,
      double.infinity,
    );

    if (drawableWidth <= 0 || drawableHeight <= 0) {
      return;
    }

    final paint = Paint()
      ..color = strokeColor
      ..strokeWidth = strokeWidth
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round
      ..style = PaintingStyle.stroke
      ..isAntiAlias = true;

    for (final stroke in strokes) {
      if (!stroke.isValid) {
        continue;
      }

      final path = Path();

      for (var pointIndex = 0; pointIndex < stroke.pointCount; pointIndex++) {
        final point = _toCanvasOffset(
          normalizedX: stroke.x[pointIndex],
          normalizedY: stroke.y[pointIndex],
          drawableWidth: drawableWidth,
          drawableHeight: drawableHeight,
        );

        if (pointIndex == 0) {
          path.moveTo(point.dx, point.dy);
        } else {
          path.lineTo(point.dx, point.dy);
        }
      }

      canvas.drawPath(path, paint);
    }
    if (showStrokeOrder) {
      _drawStrokeOrderMarkers(
        canvas: canvas,
        drawableWidth: drawableWidth,
        drawableHeight: drawableHeight,
      );
    }
  }

  void _drawStrokeOrderMarkers({
    required Canvas canvas,
    required double drawableWidth,
    required double drawableHeight,
  }) {
    final markerFillPaint = Paint()
      ..color = Colors.white.withValues(alpha: 0.92)
      ..style = PaintingStyle.fill
      ..isAntiAlias = true;

    final markerBorderPaint = Paint()
      ..color = Colors.black.withValues(alpha: 0.55)
      ..strokeWidth = 1.2
      ..style = PaintingStyle.stroke
      ..isAntiAlias = true;

    const markerRadius = 10.0;

    for (var strokeIndex = 0; strokeIndex < strokes.length; strokeIndex++) {
      final stroke = strokes[strokeIndex];

      if (!stroke.isValid) {
        continue;
      }

      final markerCenter = _toCanvasOffset(
        normalizedX: stroke.x.first,
        normalizedY: stroke.y.first,
        drawableWidth: drawableWidth,
        drawableHeight: drawableHeight,
      );

      final adjustedCenter = Offset(
        markerCenter.dx.clamp(
          markerRadius + 2,
          padding + drawableWidth - markerRadius - 2,
        ),
        markerCenter.dy.clamp(
          markerRadius + 2,
          padding + drawableHeight - markerRadius - 2,
        ),
      );

      canvas.drawCircle(adjustedCenter, markerRadius, markerFillPaint);

      canvas.drawCircle(adjustedCenter, markerRadius, markerBorderPaint);

      final textPainter = TextPainter(
        text: TextSpan(
          text: '${strokeIndex + 1}',
          style: const TextStyle(
            color: Colors.black,
            fontSize: 11,
            fontWeight: FontWeight.bold,
          ),
        ),
        textAlign: TextAlign.center,
        textDirection: TextDirection.ltr,
      );

      textPainter.layout();

      textPainter.paint(
        canvas,
        Offset(
          adjustedCenter.dx - textPainter.width / 2,
          adjustedCenter.dy - textPainter.height / 2,
        ),
      );
    }
  }

  void _drawGuides(Canvas canvas, Size size) {
    final guidePaint = Paint()
      ..color = guideColor.withValues(alpha: 0.55)
      ..strokeWidth = 1
      ..style = PaintingStyle.stroke;

    _drawDashedLine(
      canvas: canvas,
      start: Offset(size.width / 2, 0),
      end: Offset(size.width / 2, size.height),
      paint: guidePaint,
    );

    _drawDashedLine(
      canvas: canvas,
      start: Offset(0, size.height / 2),
      end: Offset(size.width, size.height / 2),
      paint: guidePaint,
    );
  }

  void _drawDashedLine({
    required Canvas canvas,
    required Offset start,
    required Offset end,
    required Paint paint,
    double dashLength = 4,
    double gapLength = 4,
  }) {
    final difference = end - start;
    final totalLength = difference.distance;

    if (totalLength <= 0) {
      return;
    }

    final direction = difference / totalLength;
    var travelled = 0.0;

    while (travelled < totalLength) {
      final segmentEnd = (travelled + dashLength).clamp(0.0, totalLength);

      canvas.drawLine(
        start + direction * travelled,
        start + direction * segmentEnd,
        paint,
      );

      travelled += dashLength + gapLength;
    }
  }

  Offset _toCanvasOffset({
    required double normalizedX,
    required double normalizedY,
    required double drawableWidth,
    required double drawableHeight,
  }) {
    final clampedX = normalizedX.clamp(0.0, 1.0);

    final clampedY = normalizedY.clamp(0.0, 1.0);

    return Offset(
      padding + clampedX * drawableWidth,
      padding + clampedY * drawableHeight,
    );
  }

  @override
  bool shouldRepaint(covariant StrokePreviewPainter oldDelegate) {
    return oldDelegate.strokes != strokes ||
        oldDelegate.strokeColor != strokeColor ||
        oldDelegate.backgroundColor != backgroundColor ||
        oldDelegate.guideColor != guideColor ||
        oldDelegate.strokeWidth != strokeWidth ||
        oldDelegate.showGuides != showGuides ||
        oldDelegate.showStrokeOrder != showStrokeOrder ||
        oldDelegate.padding != padding;
  }
}
