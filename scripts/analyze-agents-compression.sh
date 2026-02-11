#!/bin/bash
# Analyze the compression ratio of AGENTS.md files compared to their source documents

echo "Analyzing AGENTS.md aggregation efficiency..."
echo "=============================================="
echo ""

total_input_size=0
total_output_size=0
file_count=0
ratios=()

# Find all AGENTS.md files (excluding the root one for now)
while IFS= read -r agents_file; do
  # Get the directory containing this AGENTS.md
  dir=$(dirname "$agents_file")

  # Skip if this is the root AGENTS.md (we'll handle it separately)
  if [ "$dir" = "." ]; then
    continue
  fi

  # Calculate total size of input documents
  input_size=0
  sum_count=0
  subdir_count=0

  # 1. Sum up all .sum files in this directory (not recursive)
  while IFS= read -r sum_file; do
    size=$(stat -f%z "$sum_file" 2>/dev/null || stat -c%s "$sum_file" 2>/dev/null)
    input_size=$((input_size + size))
    sum_count=$((sum_count + 1))
  done < <(find "$dir" -maxdepth 1 -name "*.sum" -type f 2>/dev/null)

  # 2. Sum up all AGENTS.md files in immediate subdirectories
  while IFS= read -r subdir; do
    subagents="$subdir/AGENTS.md"
    if [ -f "$subagents" ]; then
      size=$(stat -f%z "$subagents" 2>/dev/null || stat -c%s "$subagents" 2>/dev/null)
      input_size=$((input_size + size))
      subdir_count=$((subdir_count + 1))
    fi
  done < <(find "$dir" -maxdepth 1 -mindepth 1 -type d 2>/dev/null)

  # Get the size of this AGENTS.md
  output_size=$(stat -f%z "$agents_file" 2>/dev/null || stat -c%s "$agents_file" 2>/dev/null)

  # Calculate ratio if we have input
  if [ "$input_size" -gt 0 ]; then
    ratio=$(awk "BEGIN {printf \"%.2f\", ($output_size / $input_size) * 100}")
    ratios+=("$ratio")

    # Accumulate totals
    total_input_size=$((total_input_size + input_size))
    total_output_size=$((total_output_size + output_size))
    file_count=$((file_count + 1))

    # Format directory name
    dir_display="$dir"
    if [ ${#dir_display} -gt 50 ]; then
      dir_display="...${dir_display: -47}"
    fi

    # Show details for all files (or filter by criteria)
    printf "%-52s %7s → %7s (%6.2f%%) [%2d .sum, %2d subdirs]\n" \
      "$dir_display" \
      "$(numfmt --to=iec --suffix=B $input_size 2>/dev/null || echo "${input_size}B")" \
      "$(numfmt --to=iec --suffix=B $output_size 2>/dev/null || echo "${output_size}B")" \
      "$ratio" \
      "$sum_count" \
      "$subdir_count"
  fi
done < <(find . -name "AGENTS.md" -type f | sort)

# Now handle the root AGENTS.md separately
if [ -f "./AGENTS.md" ]; then
  echo ""
  echo "--- Root AGENTS.md ---"

  root_input=0
  root_sum_count=0
  root_subdir_count=0

  # Sum direct .sum files in root
  while IFS= read -r sum_file; do
    size=$(stat -f%z "$sum_file" 2>/dev/null || stat -c%s "$sum_file" 2>/dev/null)
    root_input=$((root_input + size))
    root_sum_count=$((root_sum_count + 1))
  done < <(find . -maxdepth 1 -name "*.sum" -type f 2>/dev/null)

  # Sum AGENTS.md from immediate subdirectories
  while IFS= read -r subdir; do
    subagents="$subdir/AGENTS.md"
    if [ -f "$subagents" ]; then
      size=$(stat -f%z "$subagents" 2>/dev/null || stat -c%s "$subagents" 2>/dev/null)
      root_input=$((root_input + size))
      root_subdir_count=$((root_subdir_count + 1))
    fi
  done < <(find . -maxdepth 1 -mindepth 1 -type d 2>/dev/null | grep -v "^\./\.")

  root_output=$(stat -f%z "./AGENTS.md" 2>/dev/null || stat -c%s "./AGENTS.md" 2>/dev/null)

  if [ "$root_input" -gt 0 ]; then
    root_ratio=$(awk "BEGIN {printf \"%.2f\", ($root_output / $root_input) * 100}")

    printf "%-52s %7s → %7s (%6.2f%%) [%2d .sum, %2d subdirs]\n" \
      "." \
      "$(numfmt --to=iec --suffix=B $root_input 2>/dev/null || echo "${root_input}B")" \
      "$(numfmt --to=iec --suffix=B $root_output 2>/dev/null || echo "${root_output}B")" \
      "$root_ratio" \
      "$root_sum_count" \
      "$root_subdir_count"

    # Add to totals
    total_input_size=$((total_input_size + root_input))
    total_output_size=$((total_output_size + root_output))
    file_count=$((file_count + 1))
    ratios+=("$root_ratio")
  fi
fi

echo ""
echo "=============================================="
echo "Summary Statistics"
echo "=============================================="
echo "AGENTS.md files analyzed: $file_count"
echo "Total input size: $(numfmt --to=iec-i --suffix=B $total_input_size 2>/dev/null || echo "$total_input_size bytes")"
echo "Total output size: $(numfmt --to=iec-i --suffix=B $total_output_size 2>/dev/null || echo "$total_output_size bytes")"

# Calculate overall average ratio
if [ "$file_count" -gt 0 ] && [ "$total_input_size" -gt 0 ]; then
  overall_ratio=$(awk "BEGIN {printf \"%.2f\", ($total_output_size / $total_input_size) * 100}")
  compression_ratio=$(awk "BEGIN {printf \"%.2f\", ($total_input_size / $total_output_size)}")
  space_saved=$((total_input_size - total_output_size))

  echo "Overall aggregation ratio: $overall_ratio%"
  echo "Compression factor: ${compression_ratio}x"
  echo "Space efficiency: $(numfmt --to=iec-i --suffix=B $space_saved 2>/dev/null || echo "$space_saved bytes") saved"
  echo ""

  # Calculate mean ratio
  sum_ratios=0
  for r in "${ratios[@]}"; do
    sum_ratios=$(awk "BEGIN {print $sum_ratios + $r}")
  done
  mean_ratio=$(awk "BEGIN {printf \"%.2f\", $sum_ratios / $file_count}")
  echo "Mean ratio: $mean_ratio%"

  # Calculate median
  IFS=$'\n' sorted_ratios=($(sort -n <<<"${ratios[*]}"))
  unset IFS
  mid=$((file_count / 2))
  if [ $((file_count % 2)) -eq 0 ]; then
    median=$(awk "BEGIN {printf \"%.2f\", (${sorted_ratios[$mid-1]} + ${sorted_ratios[$mid]}) / 2}")
  else
    median="${sorted_ratios[$mid]}"
  fi
  echo "Median ratio: $median%"

  # Find min and max
  min_ratio="${sorted_ratios[0]}"
  max_ratio="${sorted_ratios[$((file_count-1))]}"
  echo "Min ratio: $min_ratio%"
  echo "Max ratio: $max_ratio%"

  echo ""
  echo "=============================================="
  echo "Interpretation"
  echo "=============================================="

  if (( $(echo "$overall_ratio < 50" | bc -l) )); then
    echo "✓ EXCELLENT: Strong aggregation/summarization (>2x compression)"
  elif (( $(echo "$overall_ratio < 70" | bc -l) )); then
    echo "✓ GOOD: Moderate aggregation (~1.5x compression)"
  elif (( $(echo "$overall_ratio < 90" | bc -l) )); then
    echo "~ ACCEPTABLE: Light aggregation (<1.2x compression)"
  else
    echo "⚠ MINIMAL: Very little compression (nearly 1:1)"
  fi

  echo ""
  echo "The aggregation process reduces ${file_count} AGENTS.md files from"
  echo "their combined input sources by a factor of ${compression_ratio}x."
  echo "=============================================="
fi
