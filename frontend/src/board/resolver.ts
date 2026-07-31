import { Container } from './Container'
import { CustomHtmlBlock } from './blocks/CustomHtmlBlock'
import { DailyTaskListBlock } from './blocks/DailyTaskListBlock'
import { ImageBlock } from './blocks/ImageBlock'
import { NoteBlock } from './blocks/NoteBlock'
import { OverdueTaskListBlock } from './blocks/OverdueTaskListBlock'
import { WeeklyTaskListBlock } from './blocks/WeeklyTaskListBlock'

export const resolver = {
  Container,
  NoteBlock,
  DailyTaskListBlock,
  WeeklyTaskListBlock,
  OverdueTaskListBlock,
  ImageBlock,
  CustomHtmlBlock,
}
